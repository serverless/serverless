'use strict';

/**
 * JAWS Command: custom
 * - Run a custom command from jaws-commands.js
 */

// Defaults
var Promise = require('bluebird'),
  fs = Promise.promisifyAll(require('fs'));

module.exports = function(JAWS) {

  JAWS.custom = function(command) {

    // Validate
    if (!command || !command['0']) return console.log('JAWS Error: Sorry, this command was not recognized or is malformed');

    command = command['0'].trim();

    // Find Custom Command
    try {
      if (fs.existsSync(JAWS._meta.projectRootPath + '/jaws-commands.js')) command = require(JAWS._meta.projectRootPath + '/jaws-commands.js')[command];
      if (fs.existsSync(JAWS._meta.cwd + '/jaws-commands.js')) command = require(JAWS._meta.projectRootPath + '/jaws-commands.js')[command];
    } catch (e) {
      return console.log('JAWS Error: Could not find this custom command');
    }

    if (!typeof command !== 'function') return console.log('JAWS Error: Sorry, this command could not be found in the current directory or your project\'s root folder.');

    // Run
    return command();

  };
};
