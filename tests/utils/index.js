'use strict';

const os = require('os');
const path = require('path');
const crypto = require('crypto');

module.exports = {
  getTmpDirPath: () => path.join(os.tmpdir(), crypto.randomBytes(8).toString('hex')),
};
