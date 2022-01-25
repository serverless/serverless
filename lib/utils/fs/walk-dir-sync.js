'use strict';

const path = require('path');
const fs = require('fs');

function walkDirSync(dirPath, opts) {
  const options = Object.assign(
    {
      noLinks: false,
    },
    opts
  );
  let filePaths = [];
  const list = fs.readdirSync(dirPath);
  list.forEach((filePathParam) => {
    let filePath = filePathParam;
    filePath = path.join(dirPath, filePath);
    const stat = options.noLinks ? fs.lstatSync(filePath) : fs.statSync(filePath);
    // skipping symbolic links when noLinks option
    if (options.noLinks && stat && stat.isSymbolicLink()) {
      return;
    } else if (stat && stat.isDirectory()) {
      filePaths = filePaths.concat(walkDirSync(filePath, opts));
    } else {
      filePaths.push(filePath);
    }
  });

  return filePaths;
}

module.exports = walkDirSync;
