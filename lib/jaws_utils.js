'use strict';

/**
 * JAWS CLI: Utilities
 */

var Promise = require('bluebird'),
  fs = Promise.promisifyAll(require('fs'));


module.exports.findProjectRootPath = function() {

  // Check if cwd is root
  if (fs.existsSync(process.cwd() + '/jaws.json')) {
    var awsm = require(process.cwd() + '/jaws.json');
    if (awsm.profile === 'project') {
      return process.cwd();
    }
  }

};
