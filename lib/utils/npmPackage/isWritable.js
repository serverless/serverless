'use strict';

const { format } = require('util');
const path = require('path');
const fs = require('fs').promises;

const npmPackageRoot = path.resolve(__dirname, '../../../');

module.exports = async serverless => {
  const stats = await fs.stat(npmPackageRoot);
  try {
    await fs.utimes(npmPackageRoot, String(stats.atimeMs / 1000), String(stats.mtimeMs / 1000));
    return true;
  } catch (error) {
    if (process.env.SLS_DEBUG) {
      serverless.cli.log(format('Auto update: file access error: %O', error));
    }
    return false;
  }
};
