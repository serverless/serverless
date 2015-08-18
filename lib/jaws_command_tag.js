'use strict';

/**
 * JAWS Command: tag
 * - Tags a lambda function with "deploy:true"
 */

// Defaults
var Promise = require('bluebird'),
  fs = Promise.promisifyAll(require('fs')),
  jsonfile = Promise.promisifyAll(require('jsonfile'));

module.exports = function(JAWS) {

  JAWS.tag = function() {

    // Check if cwd is a lambda function
    if (!fs.existsSync(process.cwd() + '/jaws.json')) return console.log('JAWS Error: Could\'nt find a lambda function.  Are you sure you are in a lambda function\'s directory?');

    var jawsJson = require(process.cwd() + '/jaws.json');

    // Check if jaws.json has correct profile
    if (['lambda', 'lambdaGroup'].indexOf(jawsJson.profile) === -1) return console.log('JAWS Error: This jaws-module is not a lambda function.  Make sure it\'s profile is set to lambda or lambdaGroup');

    // Handle profile type 'lambda'
    if (jawsJson.profile === 'lambda') {

      // Add deploy property
      if (!jawsJson.deploy) jawsJson.deploy = 1;
      jsonfile.spaces = 2;
      jsonfile.writeFileSync(process.cwd() + '/jaws.json', jawsJson);

    }

    // Handle profile type 'lambdaGroup'
    if (jawsJson.profile === 'lambdaGroup') {

    }

    // Inform
    return console.log('JAWS: Lambda tagged for deployment.');

  };
};
