/* eslint no-console:0 */

'use strict';

const config = require('config');
const {
    SMTPServer
} = require('smtp-server');
const StreamHash = require('./lib/stream-hash');

let messagecounter = 0;

// Setup server
const server = new SMTPServer({

    // log to console
    logger: true,

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

        stream.pipe(streamHash).pipe(process.stdout);
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
    console.log(err);
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
            console.log('Server listening on %s:%s', host || '*', config.port);
            setImmediate(startNextHost);
        });
    };

    startNextHost();
}

start(() => {
    if (config.group) {
        try {
            process.setgid(config.group);
            console.log('Changed group to "%s" (%s)', config.group, process.getgid());
        } catch (E) {
            console.log('Failed to change group to "%s" (%s)', config.group, E.message);
            return process.exit(1);
        }
    }

    if (config.user) {
        try {
            process.setuid(config.user);
            console.log('Changed user to "%s" (%s)', config.user, process.getuid());
        } catch (E) {
            console.log('Failed to change user to "%s" (%s)', config.user, E.message);
            return process.exit(1);
        }
    }

    console.log('Server started %s', Date.now());
});
