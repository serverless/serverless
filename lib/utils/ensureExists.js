'use strict';

const fse = require('fs-extra');
const fs = require('fs');
const path = require('path');

module.exports = async (filename, generate) => {
  const cacheDir = path.dirname(filename);
  try {
    const stats = await fs.promises.lstat(filename);
    if (stats.isFile()) {
      return;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  await fse.ensureDir(cacheDir);
  await generate(cacheDir);
};
