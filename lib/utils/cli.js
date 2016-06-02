'use strict';

/**
 * Serverless Services: CLI
 */

let Promise   = require('bluebird'),
    prompt    = require('prompt'),
    path      = require('path'),
    _         = require('lodash'),
    os        = require('os'),
    SError    = require('../Error'),
    fs        = require('fs'),
    chalk     = require('chalk'),
    Spinner   = require('cli-spinner').Spinner,
    moment    = require('moment'),
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
 * Quick Help
 */

exports.quickHelp = function() {
  let text = '';
  text     = text + 'Use the <up>, <down>, <pageup>, <pagedown>, <home>, and <end> keys to navigate.' + os.EOL;
  text     = text + 'Press <enter> to select/deselect, or <space> to select/deselect and move down.' + os.EOL;
  text     = text + 'Press <ctrl> + a to select all, and <ctrl> + d to deselect all.' + os.EOL;
  text     = text + 'Press <ctrl> + f to select all functions, and <ctrl> + e to select all endpoints.' + os.EOL;
  text     = text + 'Press <ctrl> + <enter> to immediately deploy selected.' + os.EOL;
  text     = text + 'Press <escape> to cancel.' + os.EOL;

  console.log(chalk.yellow(text));
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

      }
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
  data: null
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
  let utils = require('./index');
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

    // Move the selected choice up by x number of steps.
    let selectStateUp = function(steps) {
      // Set default steps.
      if(steps === undefined)
        steps = 1;

      // Move number of times defined by steps.
      for(let i = 0; i < steps; ++i)
      {
        // Proceed if not at top.
        if(Select.state.index > 1) {
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
        }
      }

      // Render
      return Select._render();
    };

    // Move the selected choice down by x number of steps.
    let selectStateDown = function(steps) {
      // Set default steps.
      if(steps === undefined)
        steps = 1;

      // Move number of times defined by steps.
      for(let i = 0; i < steps; ++i)
      {
        // Proceed if not at bottom.
        if(Select.state.index < Select.state.choices.length) {
          if (Select.state.choices[Select.state.index].spacer) {
            // If next choice is spacer, move down 2
            Select.state.index = Select.state.index + 2;
          } else {
            // Move down
            Select.state.index = Select.state.index + 1;
          }
        }
      }

      // Render
      return Select._render();
    };

    // Move the selected choice to the first.
    let selectStateTop = function() {
      Select.state.index = 2;
      return Select._render();
    };

    // Move selected choice to the last.
    let selectStateBottom = function() {
      Select.state.index = Select.state.choices.length;
      return Select._render();
    };

    // Toggle the current choice.
    let toggleOption = function() {
      // Toggle option
      Select.state.choices[Select.state.index - 1].toggled = Select.state.choices[Select.state.index - 1].toggled ? false : true;

      // Render
      return Select._render();
    };

    // Select/delselect all choices.
    let selectChoicesAll = function(selected) {
      // Cycle through all choices.
      for(let i = 0; i < Select.state.choices.length; ++i)
      {
        // If the choice is not a spacer and not an action.
        if(!Select.state.choices[i].spacer && !Select.state.choices[i].action)
          // Mark the choice as the specified selected state.
          Select.state.choices[i].toggled = selected;
      }

      // Render
      return Select._render();
    };

    // Select all choices of a specific type.
    let selectChoicesAllType = function(type) {
      // Cycle through all choices.
      for(let i = 0; i < Select.state.choices.length; ++i)
      {
        // If the choice is not a spacer and not an action.
        if(!Select.state.choices[i].spacer && !Select.state.choices[i].action)
        {
          // If the choice type matches the specified type.
          if(Select.state.choices[i].type && Select.state.choices[i].type === type)
          {
            // Mark as selected.
            Select.state.choices[i].toggled = true;
          }
        }
      }

      // Render
      return Select._render();
    };

    if( !key ) return Select._render;

    // Handle ctrl + c.
    if (key.ctrl && key.name == 'c') {
      process.stdin.pause();

    // Handle other key combinations.
    } else if (key.name == 'home') {
      selectStateTop();
    } else if (key.name == 'end') {
      selectStateBottom();
    } else if (key.name == 'up') {
      selectStateUp();
    } else if (key.name == 'pageup') {
      selectStateUp(4);
    } else if (key.name == 'down') {
      selectStateDown();
    } else if (key.name == 'pagedown') {
      selectStateDown(4);
    } else if (key.ctrl && key.name == 'a') {
      selectChoicesAll(true);
    } else if (key.ctrl && key.name == 'd') {
      selectChoicesAll(false);
    } else if (key.ctrl && key.name == 'e') {
      selectChoicesAllType('endpoint');
    } else if (key.ctrl && key.name == 'f') {
      selectChoicesAllType('function');
    } else if (key.name == 'return' ||
      key.name == 'space' ||
      key.name == 'escape' ||
      key.name == 'enter') {

      // Check if "cancel" option, "done" option or ctrl was pressed.
      if (Select.state.choices[Select.state.index - 1].action
        && Select.state.choices[Select.state.index - 1].action.toLowerCase() === 'cancel' || key.name == 'escape') {
        process.exit();
      } else if ((Select.state.choices[Select.state.index - 1].action
        && Select.state.choices[Select.state.index - 1].action.toLowerCase() === 'done') || key.name == 'enter') {
        process.stdin.removeListener('keypress', keypressHandler);
        return Select._close();
      } else {

        toggleOption();

        // If the key was <space>, then move to the next choice.
        if(key.name == 'space')
          selectStateDown();

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
        },
        {
          action: 'Cancel',
          label: 'Cancel'
        }
      );
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
  console.log(chalk.dim('* Add "--debug" to any command for extra useful logs'));

  console.log('');

  for (let cmdContext in allCommands) {
    let dots    = _.repeat('.', 15 - cmdContext.length);
    let actions = _.keys( allCommands[cmdContext] ).sort().join(', ');

    console.log('%s %s %s', chalk.yellow(cmdContext), chalk.dim(dots), actions);
  }

  console.log('');

  return Promise.resolve();
};

/**
 * Generate Context Help
 */

exports.generateContextHelp = function(cmdContext, allCommands) {
  console.log(chalk.yellow.underline('\nActions for the \'%s\' context:'), cmdContext);
  console.log(chalk.dim('Note: pass "--help" after any <context> <action> for contextual help\n'));


  for (let cmdAction in allCommands[cmdContext]) {
    let dots         = _.repeat('.', 15 - cmdAction.length);
    let actionConfig = allCommands[cmdContext][cmdAction];

    console.log('%s %s %s', chalk.yellow(cmdAction), chalk.dim(dots), actionConfig.description);
  }

  console.log('');

  return Promise.resolve();
};

/**
 * Generate Action Help
 */

exports.generateActionHelp = function(cmdConfig) {
  console.log(chalk.yellow.underline('\n%s\n'), cmdConfig.description);

  for (let opt of cmdConfig.options) {
    console.log(chalk.yellow('  -%s, --%s'), opt.shortcut, opt.option);
    console.log('\t%s', opt.description);
    console.log('');
  }

  return Promise.resolve();
};

/**
 * AWS Prompt Input ENV Key
 */
// TODO: Remove this and put it into its respective Actions
exports.awsPromptInputEnvKey = function(message, SPluginObj) {

  // Resolve key if provided
  if (SPluginObj.evt.options.key) return Promise.resolve(SPluginObj.evt.options.key);

  // Skip if not interactive
  if (!SPluginObj.S.config.interactive) return Promise.resolve();

  let prompts = {
    properties: {}
  };

  prompts.properties.key = {
    description: message.yellow,
    required:    true,
    message:     'environment variable key is required.'
  };

  return SPluginObj.cliPromptInput(prompts, null)
    .then(function(answers) {
      return answers.key;
    });
};
// TODO: Remove this and put it into its respective Actions
exports.awsPromptInputEnvValue = function(message, SPluginObj) {

  // Resolve value if provided
  if (SPluginObj.evt.options.value) return Promise.resolve(SPluginObj.evt.options.value);

  // Skip if not interactive
  if (!SPluginObj.S.config.interactive) return Promise.resolve();

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


exports.formatLambdaLogEvent = function (msg)  {
  const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

  if (msg.startsWith('START') || msg.startsWith('END') || msg.startsWith('REPORT')) {
    return chalk.gray(msg);
  } else if (msg.trim() === 'Process exited before completing request') {
    return chalk.red(msg);
  }

  const splitted = msg.split('\t');

  if (splitted.length < 3 || new Date(splitted[0]) == 'Invalid Date') {
    return msg;
  } else {
    const reqId = splitted[1],
          time  = chalk.green(moment(splitted[0]).format(dateFormat)),
          text  = msg.split(reqId + '\t')[1];

    return `${time}\t${chalk.yellow(reqId)}\t${text}`;
  }
};
