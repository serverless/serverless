'use strict';

/**
 * Serverless Services: CLI
 */

let Promise   = require('bluebird'),
    prompt    = require('prompt'),
    path      = require('path'),
    os        = require('os'),
    SError = require('../ServerlessError'),
    utils     = require('../utils'),
    fs        = require('fs'),
    chalk     = require('chalk'),
    Spinner   = require('cli-spinner').Spinner,
    keypress  = require('keypress');

Promise.promisifyAll(fs);
Promise.promisifyAll(prompt);

/**
 * ASCII Greeting
 */

exports.asciiGreeting = function() {
  let ver = require('../../package.json').version;

  let art = '';
  art     = art + ' _______                             __' + os.EOL;
  art     = art + '|   _   .-----.----.--.--.-----.----|  .-----.-----.-----.' + os.EOL;
  art     = art + '|   |___|  -__|   _|  |  |  -__|   _|  |  -__|__ --|__ --|' + os.EOL;
  art     = art + '|____   |_____|__|  \\___/|_____|__| |__|_____|_____|_____|' + os.EOL;
  art     = art + '|   |   |             The Serverless Application Framework' + os.EOL;
  art     = art + '|       |                           serverless.com, v' + ver + os.EOL;
  art     = art + '`-------\'';

  console.log(chalk.yellow(art));
};

/**
 * Spinner
 */

exports.spinner = function(message) {
  let _this = this,
      spinner;

  if (_this.isInteractive()) {
    message = message ? message : '';
    spinner = new Spinner('Serverless: ' + chalk.yellow('%s ' + message));
    spinner.setSpinnerString('|/-\\');
  } else {

    // Non-interactive spinner object
    spinner = {
      start: function(message) {
        message = message || 'Loading... ';
        process.stdout.write(`Serverless: ${message}`);
      },
      stop:  function(message) {

        // Because of how spinner is used with normal library
        // we do a small hack and still allow for setting message
        if (message === true || message === false) {
          message = 'Done!\n';
        }

        message = message || 'Done!\n';
        process.stdout.write(message);

      },
    };
  }

  return spinner;
};

/**
 * Log
 */

exports.log = function(message) {
  console.log('Serverless: ' + chalk.yellow(message + '  '));
};

/**
 * Prompt
 */

exports.prompt = function() {
  prompt.start();
  prompt.delimiter = '';
  prompt.message   = 'Serverless: ';
  return prompt;
};

/**
 * Command validator
 */

exports.validateCmd = function(option, validOptions) {
  if (-1 == validOptions.indexOf(option)) {
    console.log('Unsupported command "' + option + '". Valid command(s): ' + validOptions.join(', '));
    return false;
  } else {
    return true;
  }
};

/**
 * isTTY Determines if we have Interactive Terminal
 */

exports.isInteractive = function() {
  return process.stdout.isTTY && !process.env.CI;
};

/**
 * Prompt: Select
 *
 * Accepts array: {key: '1: ', key2: '(deployed) ', value: 'a great choice!'}
 * Or: {spacer: '-----'}
 * @returns {Promise}
 */

let Select = {
  data: null,
};

// Render
Select._render = function() {

  let _this = this;

  // Clear Rendering
  _this._clear();

  // Reset line count
  _this.state.lines = 1;

  // Render Line
  for (let i = 0; i < _this.state.choices.length; i++) {

    let choice = _this.state.choices[i],
        line   = '';

    // Increment line count
    _this.state.lines++;

    // Select Arrow
    let arrow = i === (_this.state.index - 1) ? '  > ' : '    ';

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

  let _this = this;

  for (let i = 1; i < Select.state.lines; i++) {
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine();
  }
};

// Private: Close
Select._close = function(cb) {
  utils.sDebug('Closing select listener');
  let _this = this;

  process.stdin.pause();

  // Gather Choices
  let selected = [];
  for (let i = 0; i < _this.state.choices.length; i++) {
    if (_this.state.choices[i].toggled) selected.push(_this.state.choices[i]);
  }

  return Select._promise(selected);
};

/**
 * Select
 */

exports.select = function(message, choices, multi, doneLabel) {

  let _this = this;

  if (!_this.isInteractive()) {
    throw new SError('You must specify all necessary options when in a non-interactive mode.')
  }

  // Set keypress listener, if not set
  if (!Select.state) keypress(process.stdin);

  let keypressHandler = function(ch, key) {
    if( !key ) return Select._render;

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

      // Render
      return Select._render();

    } else if (key.name == 'down' && Select.state.index < Select.state.choices.length) {

      if (Select.state.choices[Select.state.index].spacer) {

        // If next choice is spacer, move down 2
        Select.state.index = Select.state.index + 2;

      } else {

        // Move down
        Select.state.index = Select.state.index + 1;

      }

      // Render
      return Select._render();

    } else if (key.name == 'return') {

      // Check if "done" option
      if (Select.state.choices[Select.state.index - 1].action
        && Select.state.choices[Select.state.index - 1].action.toLowerCase() === 'done') {
        process.stdin.removeListener('keypress', keypressHandler);
        return Select._close();
      } else {

        // Toggle option
        Select.state.choices[Select.state.index - 1].toggled = Select.state.choices[Select.state.index - 1].toggled ? false : true;

        if (!Select.state.multi) {
          process.stdin.removeListener('keypress', keypressHandler);
          Select._close();
        } else {
          return Select._render();
        }
      }
    }
  };

  process.stdin.on('keypress', keypressHandler);
  process.stdin.setRawMode(true);

  return new Promise(function(resolve, reject) {

    // Resume stdin
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Update CheckList
    Select.state = {
      choices:   choices,
      index:     (choices[0] && choices[0].spacer) ? 2 : 1,
      lines:     0,
      multi:     multi,
      doneLabel: doneLabel ? doneLabel : 'Done',
    };

    // Add Done and Cancel to choices
    if (Select.state.multi) {
      Select.state.choices.push(
        {spacer: '- - - - -'},
        {
          action: 'Done',
          label:  Select.state.doneLabel,
        });
    }

    // Log Message
    if (message) console.log('Serverless: ' + chalk.yellow(message));

    // Assign CheckList Promise
    Select._promise = resolve;

    // Initial Render
    Select._render();
  });
};

/**
 * Generate Main Help
 */

exports.generateMainHelp = function(allCommands) {

  this.asciiGreeting();

  console.log(chalk.yellow.underline('\nCommands'));
  console.log(chalk.dim('* Serverless documentation: http://docs.serverless.com'));
  console.log(chalk.dim('* You can run commands with "serverless" or the shortcut "sls"'));
  console.log(chalk.dim('* Pass "--help" after any <context> <action> for contextual help'));

  for (let cmdContext in allCommands) {
    console.log(chalk.bgBlack('\n"%s" actions:'), cmdContext);
    for (let cmdAction in allCommands[cmdContext]) {
      console.log(chalk.yellow('  %s'), cmdAction);
    }
  }

  console.log('');

  return Promise.resolve();
};

/**
 * Generate Context Help
 */

exports.generateContextHelp = function(cmdContext, allCommands) {
  console.log(chalk.dim('Note: pass "--help" after any <context> <action> for contextual help'));
  console.log(chalk.yellow.underline('\n"%s" command actions:'), cmdContext);

  for (let cmdAction in allCommands[cmdContext]) {
    console.log(chalk.bgBlack('\n%s'), cmdAction);
  }

  return Promise.resolve();
};

/**
 * Generate Action Help
 */

exports.generateActionHelp = function(cmdConfig) {
  console.log(chalk.yellow('%s'), cmdConfig.description);

  console.log('');

  for (let opt of cmdConfig.options) {
    console.log(chalk.yellow('  -%s, --%s \n\t%s'), opt.shortcut, opt.option, opt.description);
    console.log('');
  }

  return Promise.resolve();
};

/**
 * AWS Prompt Input ENV Key
 */

exports.awsPromptInputEnvKey = function(message, SPluginObj) {

  // Resolve key if provided
  if (SPluginObj.evt.key) return Promise.resolve(SPluginObj.evt.key);

  // Skip if not interactive
  if (!SPluginObj.S._interactive) return Promise.resolve();

  let prompts = {
    properties: {},
  };

  prompts.properties.key = {
    description: message.yellow,
    required:    true,
    message:     'environment variable key is required.',
  };

  return SPluginObj.cliPromptInput(prompts, null)
    .then(function(answers) {
      return answers.key;
    });
};

exports.awsPromptInputEnvValue = function(message, SPluginObj) {

  // Resolve value if provided
  if (SPluginObj.evt.value) return Promise.resolve(SPluginObj.evt.value);

  // Skip if not interactive
  if (!SPluginObj.S._interactive) return Promise.resolve();

  let prompts = {
    properties: {}
  };

  prompts.properties.value = {
    description: message.yellow,
    required:    true,
    message:     'environment variable value is required.',
  };

  return SPluginObj.cliPromptInput(prompts, null)
    .then(function(answers) {
      return answers.value;
    });
};