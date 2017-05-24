'use strict';

const path = require('path');
const fileExistsSync = require('./fs/fileExistsSync');
const getServerlessDir = require('./getServerlessDir');

module.exports = function isTrackingDisabled() {
  // to be updated to .serverlessrc
  if (fileExistsSync(path.join(getServerlessDir(), 'stats-disabled'))) {
    return true;
  }
  return false;
};
