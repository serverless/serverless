'use strict';

/**
 * JAWS CLI: Utilities
 */

var Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs'));

module.exports.findProjectRootPath = function(startDir) {

  // Defaults
  var previous = '/';

  // Check if startDir is root
  if (fs.existsSync(startDir + '/jaws.json')) {
    var jawsJsonInDir = require(startDir + '/jaws.json');
    if (jawsJsonInDir.profile === 'project') return startDir;
  }

  // Check up to 10 parent levels
  for (var i = 0; i < 10; i++) {

    previous = previous + '../';
    var fullPath = startDir + previous;

    if (fs.existsSync(fullPath + 'jaws.json')) {
      var jawsJson = require(fullPath + 'jaws.json');
      if (jawsJson.profile === 'project') return fullPath;
    }
  }

  return false;

};

module.exports.getUserHome = function() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
};

/**
 * Get creds from ~/.aws/config
 *
 * @param profile
 * @returns {{key: string, secret: string}}
 */
module.exports.getAwsAdminCreds = function(profile) {
  if (!profile) profile = 'default';

  //TODO: read and trim

  return {
    key: '',
    secret: '',
  };
};

module.exports.setAwsAdminCreds = function(profile) {
  if (!profile) profile = 'default';

  //trim and make sure profile dont already exist!!
};
