// 'use strict';

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

var JawsCLI = {};

/**
 * Prompt
 */
module.exports.prompt = JawsCLI.prompt = function() {
  prompt.start();
  prompt.delimiter = '';
  prompt.message = 'JAWS: ';
  return prompt;
};

/**
 * Prompt List
 * @param message
 * @param choices
 * @returns {*}
 */
module.exports.promptList = JawsCLI.promptList = function(message, choices, defaultChoice) {

  message = message + '('.white + defaultChoice + ')'.white + os.EOL;

  for (var i = 0; i < choices.length; i++) {
    message = message
        + '      - '
        + choices[i].toString().yellow
        + os.EOL;
  }

  return message;
};

/**
 * Prompt CheckList
 *
 * @param message
 * @param choices
 * @param spacer
 *
 * Accepts array: {key: '1: ', key2: '(deployed) ', value: 'a great choice!'}
 * Or: {spacer: true}
 *
 * @returns {Promise}
 */
module.exports.promptChecklist = JawsCLI.promptChecklist = function(message, choices, spacer) {
  return new Promise(function(resolve, reject) {

    // Log Message
    console.log('JAWS: ' + chalk.yellow(message));

    var state = {
      choices: choices,
      index: 1,
      lines: 0,
    };

    // Add Done and Cancel to choices
    state.choices.push(
        { spacer: true },
        { action: 'Done'});

    var keypress = require('keypress');
    keypress(process.stdin);

    process.stdin.on('keypress', function (ch, key) {
      if (key && key.ctrl && key.name == 'c') {
        process.stdin.pause();
      } else if (key.name == 'up' && state.index > 1) {
        if (state.choices[state.index - 2].spacer) {
          state.index = state.index - 2;
        } else {
          state.index = state.index - 1;
        }
        return _render();
      } else if (key.name == 'down' && state.index < state.choices.length) {
        if (state.choices[state.index].spacer) {
          state.index = state.index + 2;
        } else {
          state.index = state.index + 1;
        }
        return _render();
      } else if (key.name == 'return') {
        if (state.choices[state.index - 1].action && state.choices[state.index - 1].action.toLowerCase() === 'done') {
          return _close();
        } else {
          state.choices[state.index - 1].toggled = state.choices[state.index - 1].toggled ? false : true;
          return _render();
        }
      }
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();

    // Initial Render
    _render();

    // Render function
    function _render() {

      // Clear Rendering
      for (var i = 1; i < state.lines; i++) {
        process.stdout.moveCursor(0, -1);
        process.stdout.clearLine();
      }

      // Reset line count
      state.lines = 1;

      // Render Line
      for (var i = 0; i < state.choices.length; i++) {
        var choice = state.choices[i],
            line = '';

        // Increment line count
        state.lines++;

        // Select Arrow
        var arrow = i === (state.index - 1) ? '  > ' : '    ';

        // Render Choice
        if (choice.value) {
          // Line - Key
          if (choice.key) line = line + choice.key;
          // Line - Key2
          if (choice.key2) line = line + choice.key2;
          // Line - Line
          line = line + choice.value;
          // Add toggled style
          if (choice.toggled) {
            line = chalk.yellow(line);
          }
          // Add line break
          line = line + os.EOL;
        }

        // Render Spacer
        if (choice.spacer) {
          line = (spacer ? spacer : '    ') + os.EOL;
        }

        // Render Action
        if (choice.action) {
          line = choice.action + os.EOL;
        }

        // TODO: Add custom word wrap after measuring terminal width. Re-count lines.

        // Render
        process.stdout.write(arrow + line);
      }
    }

    // Close function
    function _close() {

      process.stdin.pause();

      // Clean Choices
      for (var i = 0; i < state.choices.length; i++) {
        if (state.choices[i].spacer) state.choices.splice(i, 1);
        if (state.choices[i].action) state.choices.splice(i, 1);
      }

      return resolve(state.choices);
    }
  });
};

/**
 * ASCII
 */
module.exports.ascii = JawsCLI.ascii = function() {

  var art = '';
  art = art + '       ____   _____  __      __  _________ ' + os.EOL;
  art = art + '      |    | /  _  \\/  \\    /  \\/   _____/ ' + os.EOL;
  art = art + '      |    |/  /_\\  \\   \\/\\/   /\\_____  \\  ' + os.EOL;
  art = art + '  /\\__|    /    |    \\        / /        \\ ' + os.EOL;
  art = art + '  \\________\\____|__  /\\__/\\__/ /_________/ v' + packageJson.version + os.EOL;
  art = art + '' + os.EOL;
  art = art + '       *** The Server-Less Framework ***     ' + os.EOL;

  console.log(chalk.yellow(art));
};

/**
 * Spinner
 */
module.exports.spinner = JawsCLI.spinner = function(message) {
  var spinner = new Spinner('JAWS: ' + chalk.yellow('%s ' + message));
  spinner.setSpinnerString('|/-\\');
  return spinner;
};

/**
 * Log
 */
module.exports.log = JawsCLI.log = function(message) {
  console.log('JAWS: ' + chalk.yellow(message));
};
