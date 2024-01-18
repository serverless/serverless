'use strict';

// mostly copied from https://github.com/UnitedIncome/serverless-python-requirements/blob/master/lib/zip-tree.js
// modified to use native promises and fs-extra's promise support and use import/export
const fs = require('fs-extra');
const path = require('path');

/**
 * Add a directory recursively to a zip file. Files in src will be added to the top folder of zip.
 * @param {JSZip} zip a zip object in the folder you want to add files to.
 * @param {string} src the source folder.
 * @return {Promise} a promise offering the original JSZip object.
 */
module.exports.addTree = async function self(zip, src) {
  const srcN = path.normalize(src);

  const contents = await fs.readdir(srcN);
  await Promise.all(
    contents.map((name) => {
      const srcPath = path.join(srcN, name);

      return fs.stat(srcPath).then((stat) => {
        if (stat.isDirectory()) {
          return self(zip.folder(name), srcPath);
        }
        const opts = { date: 0, unixPermissions: stat.mode };
        return fs.readFile(srcPath).then((data) => zip.file(srcPath, data, opts));
      });
    })
  );
  return zip; // Original zip for chaining.
};

/**
 * Write zip contents to a file.
 * @param {JSZip} zip the zip object
 * @param {string} targetPath path to write the zip file to.
 * @return {Promise} a promise resolving to null.
 */
module.exports.writeZip = (zip, targetPath) =>
  new Promise((resolve) =>
    zip
      .generateNodeStream({
        platform: process.platform === 'win32' ? 'DOS' : 'UNIX',
        compression: 'deflate',
        compressionOptions: {
          level: 9,
        },
      })
      .pipe(fs.createWriteStream(targetPath))
      .on('finish', resolve)
  );
