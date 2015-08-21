'use strict';

/**
 * JAWS Command: custom
 * - Run a custom command from jaws-commands.js
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    fs = require('fs');

Promise.promisifyAll(fs);

module.exports = function(JAWS) {

  JAWS.custom = function(command) {
    return new Promise(function(resolve, reject) {
      // Validate
      if (!command || !command['0']) {
        reject(new JawsError(
            'Sorry, this command was not recognized or is malformed',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      command = command['0'].trim();

      // Find Custom Command
      var cmdsInRoot = path.join(JAWS._meta.projectRootPath, 'jaws-commands.js'),
          cmdsInCWD = path.join(JAWS._meta.cwd, 'jaws-commands.js');

      try {
        if (fs.existsSync(cmdsInRoot)) {
          command = require(cmdsInRoot)[command];
        } else if (fs.existsSync(cmdsInCWD)) {
          command = require(cmdsInCWD)[command];
        }
      } catch (e) {
        reject(new JawsError(
            'Could not find this custom command',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      if (!typeof command !== 'function') {
        reject(new JawsError(
            'Sorry, this command could not be found in the current directory or your project\'s root folder.',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      // Run
      command();  //TODO: come up with a standardized interface signature. I vote we tell them to return BB Promise

      resolve();
    });
  };
};
