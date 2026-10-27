const pino = require('pino');
const config = require('../config');
module.exports = pino({ level: config.LOG_LEVEL, redact: { paths: ['req.headers.authorization', 'req.headers.x-hub-signature-256', '*.access_token', '*.email', '*.phone', '*.wa_id'], censor: '[REDACTED]' } });
