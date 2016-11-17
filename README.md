# smtp-catchall

Simple SMTP server that runs on selected port (eg. 25), accepts all traffic and logs everything to console or a log file

## Setup

```
npm install --production
```

Next add config/production.json and set your configuration options (see defaults from config/default.js)

## Start

```
NODE_ENV=production node index.js
```

## License

**MIT**
