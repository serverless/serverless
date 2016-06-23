'use strict';

const version = require('../../package.json').version;
const minimist = require('minimist');
const _ = require('lodash');
const os = require('os');
const chalk = require('chalk');

class CLI {
  constructor(serverless, inputArray) {
    this.serverless = serverless;
    this.inputArray = (typeof inputArray !== 'undefined' ? inputArray : []);
    this.loadedPlugins = [];
  }

  setLoadedPlugins(plugins) {
    this.loadedPlugins = plugins;
  }

  processInput() {
    let inputArray;

    // check if commands are passed externally (e.g. used by tests)
    // otherwise use process.argv to receive the commands
    if (this.inputArray.length) {
      inputArray = this.inputArray;
    } else {
      inputArray = process.argv.slice(2);
    }

    const argv = minimist(inputArray);

    const commandsAndOptions = {};
    commandsAndOptions.commands = [];
    commandsAndOptions.options = {};

    const commands = [];
    const options = {};

    // get all the commands
    argv._.forEach((command) => {
      commands.push(command);
    });

    // remove the array which holds the commands from the argv object
    const optionsObject = _.omit(argv, ['_']);

    // get all the options
    _.forEach(optionsObject, (value, key) => {
      options[key] = value;
    });

    commandsAndOptions.commands = commands;
    commandsAndOptions.options = options;

    return commandsAndOptions;
  }

  displayHelp(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    // if only "help" or "h" was entered
    if ((commands.length === 0 && (options.help || options.h)) ||
      (commands.length === 1 && (commands.indexOf('help') > -1))) {
      this.generateMainHelp();
      return true;
    }
    // if only "version" or "v" was entered
    if ((commands.length === 0 && (options.version || options.v)) ||
      (commands.length === 1 && (commands.indexOf('version') > -1))) {
      this.getVersionNumber();
      return true;
    }
    // if "help" was entered in combination with commands (or one command)
    if (commands.length >= 1 && (options.help || options.h)) {
      this.generateCommandsHelp(commands);
      return true;
    }
    return false;
  }

  generateMainHelp() {
    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Commands'));
    this.consoleLog(chalk.dim('* Serverless documentation: http://docs.serverless.com'));
    this.consoleLog(chalk.dim('* You can run commands with "serverless" or the shortcut "sls"'));
    this.consoleLog(chalk.dim('* Pass "--help" after any <command> for contextual help'));

    this.consoleLog('');

    const sortedPlugins = this.loadedPlugins.sort();

    // TODO: implement recursive command exploration (now only 2 steps are possible)
    const dotsLength = 25;
    sortedPlugins.forEach((plugin) => {
      _.forEach(plugin.commands,
        (firstLevelCommandObject, firstLevelCommand) => {
          // check if command has lifecycleEvents (can be execute)
          if (firstLevelCommandObject.lifecycleEvents) {
            const command = firstLevelCommand;
            const usage = firstLevelCommandObject.usage;
            const dots = _.repeat('.', dotsLength - command.length);
            this.consoleLog('%s %s %s', chalk.yellow(command), chalk.dim(dots), usage);
          }
          _.forEach(firstLevelCommandObject.commands,
            (secondLevelCommandObject, secondLevelCommand) => {
              // check if command has lifecycleEvents (can be executed)
              if (secondLevelCommandObject.lifecycleEvents) {
                const command = `${firstLevelCommand} ${secondLevelCommand}`;
                const usage = secondLevelCommandObject.usage;
                const dots = _.repeat('.', dotsLength - command.length);
                this.consoleLog('%s %s %s', chalk.yellow(command), chalk.dim(dots), usage);
              }
            });
        });
    });

    this.consoleLog('');

    // print all the installed plugins
    this.consoleLog(chalk.yellow.underline('Plugins'));
    if (sortedPlugins.length) {
      this.consoleLog(sortedPlugins.map((plugin) => plugin.constructor.name).join(', '));
    } else {
      this.consoleLog('No plugins added yet');
    }
  }

  generateCommandsHelp(commands) {
    const dotsLength = 25;

    // TODO: use lodash utility functions to reduce loop usage
    // TODO: support more than 2 levels of nested commands
    if (commands.length === 1) {
      this.loadedPlugins.forEach((plugin) => {
        _.forEach(plugin.commands, (commandObject, command) => {
          if (command === commands[0]) {
            if (commandObject.lifecycleEvents) {
              // print the name of the plugin
              this.consoleLog(chalk.yellow.underline(`Plugin: ${plugin.constructor.name}`));
              // print the command with the corresponding usage
              const commandsDots = _.repeat('.', dotsLength - command.length);
              const commandsUsage = commandObject.usage;
              this.consoleLog('%s %s %s',
                chalk.yellow(command),
                chalk.dim(commandsDots),
                commandsUsage);
              // print all options
              _.forEach(commandObject.options, (optionsObject, option) => {
                const optionsDots = _.repeat('.', dotsLength - option.length);
                const optionsUsage = optionsObject.usage;
                this.consoleLog('    %s %s %s',
                  chalk.yellow(`--${option}`),
                  chalk.dim(optionsDots.slice(0, optionsDots.length - 6)),
                  optionsUsage);
              });
            }
          }
        });
      });
    } else {
      this.loadedPlugins.forEach((plugin) => {
        _.forEach(plugin.commands,
          (firstLevelCommandObject, firstLevelCommand) => {
            if (firstLevelCommand === commands[0]) {
              _.forEach(firstLevelCommandObject.commands,
                (secondLevelCommandObject, secondLevelCommand) => {
                  if (secondLevelCommand === commands[1]) {
                    if (secondLevelCommandObject.lifecycleEvents) {
                      // print the name of the plugin
                      this.consoleLog(chalk.yellow.underline(`Plugin: ${plugin.constructor.name}`));
                      // print the command with the corresponding usage
                      const commandsDots = _.repeat('.', dotsLength - secondLevelCommand.length);
                      const commandsUsage = secondLevelCommandObject.usage;
                      this.consoleLog('%s %s %s',
                        chalk.yellow(secondLevelCommand),
                        chalk.dim(commandsDots),
                        commandsUsage);
                      // print all options
                      _.forEach(secondLevelCommandObject.options, (optionsObject, option) => {
                        const optionsDots = _.repeat('.', dotsLength - option.length);
                        const optionsUsage = optionsObject.usage;
                        this.consoleLog('    %s %s %s',
                          chalk.yellow(`--${option}`),
                          chalk.dim(optionsDots.slice(0, optionsDots.length - 6)),
                          optionsUsage);
                      });
                    }
                  }
                });
            }
          });
      });
    }

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
    art = `${art} -------\'`;

    this.consoleLog(chalk.yellow(art));
    this.consoleLog('');
  }

  log(message) {
    this.consoleLog(`Serverless: ${chalk.yellow(`${message}`)}`);
  }

  consoleLog(message) {
    console.log(message); // eslint-disable-line no-console
  }
}

module.exports = CLI;
