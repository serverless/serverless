'use strict';

const version = require('../../package.json').version;
const minimist = require('minimist');
const _ = require('lodash');
const os = require('os');
const chalk = require('chalk');

class CLI {
  constructor(serverless, inputArray) {
    this.serverless = serverless;
    this.inputArray = inputArray || null;
    this.loadedPlugins = [];
    this.loadedCommands = {};

    // Add the BREAKING CHANGES here
    const functionNameBreakingChange = '"sls info" will output the short function name rather than the lambda name -> https://git.io/vDiWx'; // eslint-disable-line max-len
    const PolicyResourceDropBreakingChange = 'Will replace IamPolicyLambdaExecution resource with inline policies -> https://git.io/vDilm'; // eslint-disable-line max-len
    this.breakingChanges = [PolicyResourceDropBreakingChange, functionNameBreakingChange];
    this.logBreakingChanges('1.8.0');
  }

  setLoadedPlugins(plugins) {
    this.loadedPlugins = plugins;
  }

  setLoadedCommands(commands) {
    this.loadedCommands = commands;
  }

  processInput() {
    let inputArray;

    // check if commands are passed externally (e.g. used by tests)
    // otherwise use process.argv to receive the commands
    if (this.inputArray !== null) {
      inputArray = this.inputArray;
    } else {
      inputArray = process.argv.slice(2);
    }

    const argv = minimist(inputArray);

    const commands = [].concat(argv._);
    const options = _.omit(argv, ['_']);

    return { commands, options };
  }

  displayHelp(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    // if only "version" or "v" was entered
    if ((commands.length === 0 && (options.version || options.v)) ||
        (commands.length === 1 && (commands.indexOf('version') > -1))) {
      this.getVersionNumber();
      return true;
    }

    // if only "help" or "h" was entered
    if ((commands.length === 0) ||
        (commands.length === 0 && (options.help || options.h)) ||
        (commands.length === 1 && (commands.indexOf('help') > -1))) {
      this.generateMainHelp();
      return true;
    }

    // if "help" was entered in combination with commands (or one command)
    if (commands.length >= 1 && (options.help || options.h)) {
      this.generateCommandsHelp(commands);
      return true;
    }
    return false;
  }

  displayCommandUsage(commandObject, command) {
    const dotsLength = 30;

    // check if command has lifecycleEvents (can be executed)
    if (commandObject.lifecycleEvents) {
      const usage = commandObject.usage;
      const dots = _.repeat('.', dotsLength - command.length);
      this.consoleLog(`${chalk.yellow(command)} ${chalk.dim(dots)} ${usage}`);
    }

    _.forEach(commandObject.commands, (subcommandObject, subcommand) => {
      this.displayCommandUsage(subcommandObject, `${command} ${subcommand}`);
    });
  }

  displayCommandOptions(commandObject) {
    const dotsLength = 40;
    _.forEach(commandObject.options, (optionsObject, option) => {
      let optionsDots = _.repeat('.', dotsLength - option.length);
      const optionsUsage = optionsObject.usage;

      if (optionsObject.required) {
        optionsDots = optionsDots.slice(0, optionsDots.length - 18);
      } else {
        optionsDots = optionsDots.slice(0, optionsDots.length - 7);
      }
      if (optionsObject.shortcut) {
        optionsDots = optionsDots.slice(0, optionsDots.length - 5);
      }

      const optionInfo = `    --${option}`;
      let shortcutInfo = '';
      let requiredInfo = '';
      if (optionsObject.shortcut) {
        shortcutInfo = ` / -${optionsObject.shortcut}`;
      }
      if (optionsObject.required) {
        requiredInfo = ' (required)';
      }

      const thingsToLog = `${optionInfo}${shortcutInfo}${requiredInfo} ${
        chalk.dim(optionsDots)} ${optionsUsage}`;
      this.consoleLog(chalk.yellow(thingsToLog));
    });
  }

  generateMainHelp() {
    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Commands'));
    this.consoleLog(chalk.dim('* Serverless documentation: http://docs.serverless.com'));
    this.consoleLog(chalk.dim('* You can run commands with "serverless" or the shortcut "sls"'));
    this.consoleLog(chalk.dim('* Pass "--help" after any <command> for contextual help'));

    this.consoleLog('');

    _.forEach(this.loadedCommands, (details, command) => {
      this.displayCommandUsage(details, command);
    });

    this.consoleLog('');

    // print all the installed plugins
    this.consoleLog(chalk.yellow.underline('Plugins'));

    if (this.loadedPlugins.length) {
      const sortedPlugins = _.sortBy(
        this.loadedPlugins,
        (plugin) => plugin.constructor.name
      );

      this.consoleLog(sortedPlugins.map((plugin) => plugin.constructor.name).join(', '));
    } else {
      this.consoleLog('No plugins added yet');
    }
  }

  generateCommandsHelp(commandsArray) {
    const command = this.serverless.pluginManager.getCommand(commandsArray);
    const commandName = commandsArray.join(' ');

    // print the name of the plugin
    this.consoleLog(chalk.yellow.underline(`Plugin: ${command.pluginName}`));

    this.displayCommandUsage(command, commandName);
    this.displayCommandOptions(command);

    this.consoleLog('');
  }

  getVersionNumber() {
    this.consoleLog(version);
  }

  asciiGreeting() {
    let art = '';
    art = `${art} _______                             __${os.EOL}`;
    art = `${art}|   _   .-----.----.--.--.-----.----|  .-----.-----.-----.${os.EOL}`;
    art = `${art}|   |___|  -__|   _|  |  |  -__|   _|  |  -__|__ --|__ --|${os.EOL}`;
    art = `${art}|____   |_____|__|  \\___/|_____|__| |__|_____|_____|_____|${os.EOL}`;
    art = `${art}|   |   |             The Serverless Application Framework${os.EOL}`;
    art = `${art}|       |                           serverless.com, v${version}${os.EOL}`;
    art = `${art} -------'`;

    this.consoleLog(chalk.yellow(art));
    this.consoleLog('');
  }

  printDot() {
    process.stdout.write(chalk.yellow('.'));
  }

  log(message) {
    this.consoleLog(`Serverless: ${chalk.yellow(`${message}`)}`);
  }

  consoleLog(message) {
    console.log(message); // eslint-disable-line no-console
  }

  logBreakingChanges(nextVersion) {
    let message = '';

    if (this.breakingChanges.length !== 0 && !process.env.SLS_IGNORE_WARNING) {
      message += '\n';
      message += chalk.yellow(`  WARNING: You are running v${version}. v${nextVersion} will include the following breaking changes:\n`); // eslint-disable-line max-len
      this.breakingChanges
        .forEach(breakingChange => { message += chalk.yellow(`    - ${breakingChange}\n`); });
      message += '\n';
      message += chalk.yellow('  You can opt-out from these warnings by setting the "SLS_IGNORE_WARNING=*" environment variable.\n'); // eslint-disable-line max-len
      this.consoleLog(message);
    }

    return message;
  }
}

module.exports = CLI;
