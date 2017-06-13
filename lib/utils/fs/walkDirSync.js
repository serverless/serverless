'use strict';

const path = require('path');
const fs = require('fs');

function walkDirSync(dirPath) {
  let filePaths = [];
  const list = fs.readdirSync(dirPath);
  list.forEach((filePathParam) => {
    let filePath = filePathParam;
    filePath = path.join(dirPath, filePath);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      filePaths = filePaths.concat(walkDirSync(filePath));
    } else {
      filePaths.push(filePath);
    }
  });

  return filePaths;
}

module.exports = walkDirSync;
