'use strict';

const log = require('npmlog');
const fs = require('fs');
const config = require('config');
const {
    SMTPServer
} = require('smtp-server');
const StreamHash = require('./lib/stream-hash');

let messagecounter = 0;

log.level = 'silly';

if (config.logfile && typeof config.logfile === 'string') {
    const logstream = fs.createWriteStream(config.logfile);
    logstream.on('error', err => {
        console.error('Output error: %s', err.message); // eslint-disable-line no-console
        process.exit(1);
    });

    log.stream = logstream;
}

// Setup server
const server = new SMTPServer({

    // log to console
    logger: {
        info: logfunc('info'),
        debug: logfunc('verbose'),
        error: logfunc('error')
    },

    // not required but nice-to-have
    banner: config.greeting,

    // disable STARTTLS to allow authentication in clear text mode
    disabledCommands: ['AUTH', 'STARTTLS'],

    // Accept messages up to 100 MB
    size: config.maxSize,

    // Handle message stream
    onData(stream, session, callback) {
        let streamHash = new StreamHash();
        let hash;

        streamHash.on('hash', data => {
            hash = data.hash;
        });

        stream.pipe(streamHash);

        streamHash.on('readable', () => {
            let chunk;
            while ((chunk = streamHash.read()) !== null) {
                log.verbose('MAIL[' + session.id + '] C:', chunk.toString().trim());
            }
        });

        streamHash.on('end', () => {
            let err;
            if (stream.sizeExceeded) {
                err = new Error('Error: message exceeds fixed maximum message size 10 MB');
                err.responseCode = 552;
                return callback(err);
            }
            callback(null, 'Message queued as ' + hash + '.' + (++messagecounter) + '.' + Date.now()); // accept the message once the stream is ended
        });
    }
});

server.on('error', err => {
    log.error('SERVER', err.stack);
    server.close();
});

function start(callback) {
    let hosts;

    if (typeof config.host === 'string' && config.host) {
        hosts = config.host.trim().split(',').map(host => host.trim()).filter(host => host.trim());
        if (hosts.includes('*') || hosts.includes('all')) {
            hosts = [false];
        }
    } else {
        hosts = [false];
    }

    let pos = 0;
    let startNextHost = () => {
        if (pos >= hosts.length) {
            return setImmediate(callback);
        }
        let host = hosts[pos++];
        server.listen(config.port, host, () => {
            log.info('Server', 'Listening on %s:%s', host || '*', config.port);
            setImmediate(startNextHost);
        });
    };

    startNextHost();
}

function logfunc(level) {
    return function () {
        let args = [...arguments];
        let str = args.shift();
        let id = '';
        str = str.replace(/^\[[^\]]+\]\s*/, m => {
            id = m.trim();
            if (id === '[%s]') {
                id = '[' + args.shift() + ']';
            }
            return '';
        }).replace(/^[SC]:\s*/, prefix => {
            prefix = prefix.trim();
            id += ' ' + prefix;
            return '';
        }).trim();
        if (!str) {
            str = args.shift();
        }
        log[level]('SMTP' + id.trim(), str, ...args);
    };
}

start(() => {
    if (config.group) {
        try {
            process.setgid(config.group);
            log.info('Process', 'Changed group to "%s" (%s)', config.group, process.getgid());
        } catch (E) {
            log.error('Process', 'Failed to change group to "%s" (%s)', config.group, E.message);
            return process.exit(1);
        }
    }

    if (config.user) {
        try {
            process.setuid(config.user);
            log.info('Process', 'Changed user to "%s" (%s)', config.user, process.getuid());
        } catch (E) {
            log.error('Process', 'Failed to change user to "%s" (%s)', config.user, E.message);
            return process.exit(1);
        }
    }

    log.info('Server', 'Server started %s', Date.now());
});
