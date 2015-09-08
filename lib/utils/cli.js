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
module.exports.prompt = function() {
    prompt.start();
    prompt.delimiter = "";
    prompt.message = "JAWS: ";
    return prompt;
};

/**
 * Prompt List
 * @param message
 * @param choices
 * @returns {*}
 */
module.exports.promptList = function(message, choices, defaultChoice) {

  message = message + '('.white + defaultChoice + ')'.white + os.EOL;

  for (var i = 0;i < choices.length;i++) {
    message = message
        + '      - '
        + choices[i].toString().yellow
        + os.EOL;
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
