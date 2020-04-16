'use strict';

const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmpDirCommonPath = path.join(
  os.tmpdir(),
  'tmpdirs-serverless',
  crypto.randomBytes(2).toString('hex')
);

function getTmpDirPath() {
  return path.join(tmpDirCommonPath, crypto.randomBytes(8).toString('hex'));
}

module.exports = getTmpDirPath;
