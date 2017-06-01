'use strict';

const path = require('path');
const readFileSync = require('./fs/readFileSync');
const fileExistsSync = require('./fs/fileExistsSync');

/* Check if is inside docker container */
module.exports = function isDockerContainer() {
  // wrap in try catch to make sure that missing permissions won't break anything
  try {
    const cgroupFilePath = path.join('/', 'proc', '1', 'cgroup');
    if (fileExistsSync(cgroupFilePath)) {
      const cgroupFileContent = readFileSync(cgroupFilePath).toString();
      return !!cgroupFileContent.match(/docker/);
    }
  } catch (exception) {
    // do nothing
  }
  return false;
};
