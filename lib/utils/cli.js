'use strict';

/**
 * JAWS Services: CLI
 */

var Promise = require('bluebird'),
    prompt = require('prompt'),
    path = require('path'),
    os = require('os'),
    JawsError = require('../jaws-error/index'),
    utils = require('../utils'),
    fs = require('fs'),
    chalk = require('chalk'),
    prompt = require('prompt'),
    Spinner = require('cli-spinner').Spinner,
    packageJson = require('../../package.json');

Promise.promisifyAll(fs);

/**
 * Prompt
 */
module.exports.prompt = function(prompts, intro) {
  return new Promise(function(resolve, reject) {

    // Start Prompt
    prompt.start();

    prompt.delimiter = "";
    prompt.message = intro || "JAWS: ";

    prompt.get(prompts, function(err, result) {
      if (err) {
        reject(new JawsError(
            err,
            JawsError.errorCodes.UNKNOWN))
      }

      resolve(result);
    });
  });
};

/**
 * Prompt Numbered Choices
 * @param message
 * @param choices
 * @returns {*}
 */
module.exports.promptNumberedChoices = function(message, choices, defaultChoice) {

  message = message + '('.white + defaultChoice + ')'.white + os.EOL;

  for (var i = 0;i < choices.length;i++) {
    message = message
        + '      '
        + (i + 1).toString().yellow
        + ') '.yellow
        + choices[i].toString().yellow
        + (i < (choices.length - 1) ? os.EOL : '');
  }

  return message;
};

/**
 * ASCII
 */
module.exports.ascii = function() {

  var art = '';
  art = art + '       ____   _____  __      __  _________ ' + os.EOL;
  art = art + '      |    | /  _  \\/  \\    /  \\/   _____/ ' + os.EOL;
  art = art + '      |    |/  /_\\  \\   \\/\\/   /\\_____  \\  ' + os.EOL;
  art = art + '  /\\__|    /    |    \\        / /        \\ ' + os.EOL;
  art = art + '  \\________\\____|__  /\\__/\\__/ /_________/ v' + packageJson.version + os.EOL;
  art = art + '' + os.EOL;
  art = art + '       *** The Server-less Framework ***     ' + os.EOL;

  console.log(chalk.yellow(art));
};

/**
 * Spinner
 */
module.exports.spinner = function(message) {
  var spinner = new Spinner('JAWS: ' + chalk.yellow('%s ' + message));
  spinner.setSpinnerString('|/-\\');
  return spinner;
}

/**
 * Log
 */
module.exports.log = function(message) {
  console.log('JAWS: ' + chalk.yellow(message));
}
