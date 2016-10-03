'use strict';

const os = require('os');
const path = require('path');
const crypto = require('crypto');

const getTmpDirPath = () => path.join(os.tmpdir(),
  'tmpdirs-serverless', 'serverless', crypto.randomBytes(8).toString('hex'));

const getTmpFilePath = (fileName) => path.join(getTmpDirPath(), fileName);

module.exports = {
  getTmpDirPath,
  getTmpFilePath,
};
