'use strict';

const path = require('path');
const fsp = require('fs').promises;
const { log } = require('@serverless/utils/log');

const npmPackageRoot = path.resolve(__dirname, '../../../');

module.exports = async () => {
  const stats = await fsp.stat(npmPackageRoot);
  try {
    await fsp.utimes(npmPackageRoot, String(stats.atimeMs / 1000), String(stats.mtimeMs / 1000));
    return true;
  } catch (error) {
    log.info('Auto update: file access error: %O', error);
    return false;
  }
};
