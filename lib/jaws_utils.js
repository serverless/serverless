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
    var jawsJson = require(startDir + '/jaws.json');
    if (jawsJson.profile === 'project') return startDir;
  }

  // Check up to 10 parent levels
  for (var i = 0; i < 10; i++) {

    previous = previous + '../';
    var fullPath = startDir + previous + 'jaws.json';

    if (fs.existsSync(fullPath)) {
      var jawsJson = require(fullPath);
      if (jawsJson.profile === 'project') return fullPath;
    }
  }

  throw new Error('JAWS Error: Can\'t find your JAWS project.  Are you sure you\'re in the right folder?');

};
