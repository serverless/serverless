'use strict';

const platformClientVersion = require('@serverless/platform-client/package').version;

module.exports = require('./lib/plugin');

module.exports.sdkVersion = 'n/a';
module.exports.platformClientVersion = platformClientVersion;
