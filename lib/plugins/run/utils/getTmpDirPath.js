'use strict';

const path = require('path');
const os = require('os');
const crypto = require('crypto');

const getTmpDirPath = () => path.join(os.tmpdir(),
  'tmpdirs-serverless', 'serverless', crypto.randomBytes(8).toString('hex'));

module.exports = getTmpDirPath;
