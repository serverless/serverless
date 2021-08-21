'use strict';

const { format } = require('util');
const path = require('path');
const fsp = require('fs').promises;
const log = require('@serverless/utils/log');

const npmPackageRoot = path.resolve(__dirname, '../../../');

module.exports = async () => {
  const stats = await fsp.stat(npmPackageRoot);
  try {
    await fsp.utimes(npmPackageRoot, String(stats.atimeMs / 1000), String(stats.mtimeMs / 1000));
    return true;
  } catch (error) {
    if (process.env.SLS_DEBUG) log(format('Auto update: file access error: %O', error));
    return false;
  }
};
