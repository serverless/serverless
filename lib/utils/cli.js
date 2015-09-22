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
    Spinner = require('cli-spinner').Spinner,
    keypress = require('keypress');

Promise.promisifyAll(fs);
Promise.promisifyAll(prompt);

/**
 * ASCII
 */
exports.ascii = function() {

  var art = '';
  art = art + '       ____   _____  __      __  _________ ' + os.EOL;
  art = art + '      |    | /  _  \\/  \\    /  \\/   _____/ ' + os.EOL;
  art = art + '      |    |/  /_\\  \\   \\/\\/   /\\_____  \\  ' + os.EOL;
  art = art + '  /\\__|    /    |    \\        / /        \\ ' + os.EOL;
  art = art + '  \\________\\____|__  /\\__/\\__/ /_________/ v1 (BETA)' + os.EOL;
  art = art + '' + os.EOL;
  art = art + '       *** The Server-Less Framework ***     ' + os.EOL;

  console.log(chalk.yellow(art));
};

/**
 * Spinner
 */
exports.spinner = function(message) {
  var spinner = new Spinner('JAWS: ' + chalk.yellow('%s ' + message));
  spinner.setSpinnerString('|/-\\');
  return spinner;
};

/**
 * Log
 */
exports.log = function(message) {
  console.log('JAWS: ' + chalk.yellow(message + '  '));
};

/**
 * Prompt
 */
exports.prompt = function() {
  prompt.start();
  prompt.delimiter = '';
  prompt.message = 'JAWS: ';
  return prompt;
};

/**
 * Prompt: Select
 *
 * Accepts array: {key: '1: ', key2: '(deployed) ', value: 'a great choice!'}
 * Or: {spacer: '-----'}
 *
 * @returns {Promise}
 */
var Select = {
  data: null,
};

// Render
Select._render = function() {

  var _this = this;

  // Clear Rendering
  _this._clear();

  // Reset line count
  _this.state.lines = 1;

  // Render Line
  for (var i = 0; i < _this.state.choices.length; i++) {

    var choice = _this.state.choices[i],
        line = '';

    // Increment line count
    _this.state.lines++;

    // Select Arrow
    var arrow = i === (_this.state.index - 1) ? '  > ' : '    ';

    // Render Choice
    if (choice.label) {
      // Line - Key
      if (choice.key) line = line + choice.key;
      // Line - Key2
      if (choice.key2) line = line + choice.key2;
      // Line - Line
      line = line + choice.label;
      // Add toggled style
      if (choice.toggled) {
        line = chalk.yellow(line);
      }
      // Add line break
      line = line + os.EOL;
    }

    // Render Spacer
    if (choice.spacer) {
      line = chalk.grey(choice.spacer) + os.EOL;
    }

    // TODO: Add custom word wrap after measuring terminal width. Re-count lines.

    // Render
    process.stdout.write(arrow + line);
  }
};

// Private: Clear Rendering
Select._clear = function() {

  var _this = this;

  for (var i = 1; i < Select.state.lines; i++) {
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine();
  }
};

// Private: Close
Select._close = function(cb) {

  var _this = this;

  process.stdin.pause();

  // Gather Choices
  var selected = [];
  for (var i = 0; i < _this.state.choices.length; i++) {
    if (_this.state.choices[i].toggled) selected.push(_this.state.choices[i]);
  }

  return Select._promise(selected);
};

/**
 * Select
 * @param message
 * @param choices
 * @param multi
 * @param spacer
 * @param doneLabel
 * @returns {Promise}
 */
exports.select = function(message, choices, multi, doneLabel) {

  // Set keypress listener, if not set
  if (!Select.state) {

    keypress(process.stdin);

    process.stdin.on('keypress', function(ch, key) {

      if (key && key.ctrl && key.name == 'c') {
        process.stdin.pause();

      } else if (key.name == 'up' && Select.state.index > 1) {

        if (Select.state.index === 2 && Select.state.choices[0].spacer) {

          // If first choice is spacer, do nothing
          Select.state.index = 2;
        } else if (Select.state.choices[Select.state.index - 2].spacer) {

          // If next choice is spacer, move up 2
          Select.state.index = Select.state.index - 2;
        } else {

          // Move up
          Select.state.index = Select.state.index - 1;
        }

        return Select._render();

      } else if (key.name == 'down' && Select.state.index < Select.state.choices.length) {

        if (Select.state.choices[Select.state.index].spacer) {

          // If next choice is spacer, move down 2
          Select.state.index = Select.state.index + 2;
        } else {

          // Move down
          Select.state.index = Select.state.index + 1;
        }

        return Select._render();

      } else if (key.name == 'return') {

        // Check if "done" option
        if (Select.state.choices[Select.state.index - 1].action
            && Select.state.choices[Select.state.index - 1].action.toLowerCase() === 'done') {
          return Select._close();
        } else {

          // Toggle option
          Select.state.choices[Select.state.index - 1].toggled = Select.state.choices[Select.state.index - 1].toggled ? false : true;

          if (!Select.state.multi) {
            Select._close();
          } else {
            return Select._render();
          }
        }
      }
    });

    process.stdin.setRawMode(true);
  }

  return new Promise(function(resolve, reject) {

    // Resume stdin
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Update CheckList
    Select.state = {
      choices: choices,
      index: (choices[0] && choices[0].spacer) ? 2 : 1,
      lines: 0,
      multi: multi,
      doneLabel: doneLabel ? doneLabel : 'Done',
    };

    // Add Done and Cancel to choices
    if (Select.state.multi) {
      Select.state.choices.push(
          {spacer: '- - - - -'},
          {
            action: 'Done',
            label: Select.state.doneLabel,
          });
    }

    // Log Message
    if (message) console.log('JAWS: ' + chalk.yellow(message));

    // Assign CheckList Promise
    Select._promise = resolve;

    // Initial Render
    Select._render();
  });
};
