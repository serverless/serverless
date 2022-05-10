'use strict';

const memoizee = require('memoizee');
const { version } = require('../../package');
const ensureExists = require('./ensure-exists');
const path = require('path');
const os = require('os');

const cachePath = path.resolve(os.homedir(), '.serverless/artifacts', version);

module.exports = memoizee(
  async (filename, generate) => {
    await ensureExists(path.resolve(cachePath, filename), generate);
    return cachePath;
  },
  { length: 1, promise: true }
);
