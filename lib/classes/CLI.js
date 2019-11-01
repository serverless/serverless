'use strict';

const version = require('../../package.json').version;
const enterpriseVersion = require('@serverless/enterprise-plugin/package.json').version;
const { sdkVersion } = require('@serverless/enterprise-plugin');
const minimist = require('minimist');
const _ = require('lodash');
const os = require('os');
const chalk = require('chalk');
const getCommandSuggestion = require('../utils/getCommandSuggestion');

class CLI {
  constructor(serverless, inputArray) {
    this.serverless = serverless;
    this.inputArray = inputArray || null;
    this.loadedPlugins = [];
    this.loadedCommands = {};
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

    const base64Encode = valueStr => Buffer.from(valueStr).toString('base64');

    const toBase64Helper = value => {
      const valueStr = value.toString();
      if (valueStr.startsWith('-')) {
        if (valueStr.indexOf('=') !== -1) {
          // do not encode argument names, since those are parsed by
          // minimist, and thus need to be there unconverted:
          const splitted = valueStr.split('=', 2);
          // splitted[1] values, however, need to be encoded, since we
          // decode them later back to utf8
          const encodedValue = base64Encode(splitted[1]);
          return `${splitted[0]}=${encodedValue}`;
        }
        // do not encode plain flags, for the same reason as above
        return valueStr;
      }
      return base64Encode(valueStr);
    };

    const decodedArgsHelper = arg => {
      if (_.isString(arg)) {
        return Buffer.from(arg, 'base64').toString();
      } else if (_.isArray(arg)) {
        return _.map(arg, decodedArgsHelper);
      }
      return arg;
    };

    // encode all the options values to base64
    const valuesToParse = _.map(inputArray, toBase64Helper);

    // parse the options with minimist
    const argvToParse = minimist(valuesToParse);

    // decode all values back to utf8 strings
    const argv = _.mapValues(argvToParse, decodedArgsHelper);

    const commands = [].concat(argv._);
    const options = _.omit(argv, ['_']);

    return { commands, options };
  }

  suppressLogIfPrintCommand(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    // if "-help" or "-h" was entered
    if (options.help || options.h) {
      return;
    }

    // if "print" was NOT entered
    if (commands.indexOf('print') === -1) {
      return;
    }

    // if other command was combined with "print"
    if (commands.length !== 1) {
      return;
    }

    // Make "log" no-op to suppress warnings.
    // But preserve "consoleLog" which "print" command use to print config.
    this.log = function() {};
  }

  displayHelp(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    // if only "version" or "v" was entered
    if (
      (commands.length === 0 && (options.version || options.v)) ||
      (commands.length === 1 && commands.indexOf('version') > -1)
    ) {
      this.getVersionNumber();
      return true;
    }

    // if only "--help-interactive" was entered
    if (commands.length === 0 && options['help-interactive']) {
      this.generateInteractiveCliHelp();
      return true;
    }

    // if only "help" or "h" was entered
    if (
      commands.length === 0 ||
      (commands.length === 0 && (options.help || options.h)) ||
      (commands.length === 1 && commands.indexOf('help') > -1)
    ) {
      if (options.verbose || options.v) {
        this.generateVerboseHelp();
      } else {
        this.generateMainHelp();
      }
      return true;
    }

    // if "help" was entered in combination with commands (or one command)
    if (commands.length >= 1 && (options.help || options.h)) {
      this.generateCommandsHelp(commands);
      return true;
    }
    return false;
  }

  displayCommandUsage(commandObject, command, indents) {
    if (commandObject.isHidden) return;
    const dotsLength = 30;

    // check if command has lifecycleEvents (can be executed) and it's not a container command
    if (commandObject.lifecycleEvents && commandObject.type !== 'container') {
      const usage = commandObject.usage;
      const dots = _.repeat('.', dotsLength - command.length);
      const indent = _.repeat('  ', indents || 0);
      this.consoleLog(`${indent}${chalk.yellow(command)} ${chalk.dim(dots)} ${usage}`);
    }

    _.forEach(commandObject.commands, (subcommandObject, subcommand) => {
      this.displayCommandUsage(subcommandObject, `${command} ${subcommand}`, indents);
    });
  }

  displayCommandOptions(commandObject) {
    const dotsLength = 40;

    const commandOptions = commandObject.configDependent
      ? Object.assign({}, commandObject.options, {
          config: {
            usage: 'Path to serverless config file',
            shortcut: 'c',
          },
        })
      : commandObject.options;

    _.forEach(commandOptions, (optionsObject, option) => {
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

      const thingsToLog = `${optionInfo}${shortcutInfo}${requiredInfo} ${chalk.dim(
        optionsDots
      )} ${optionsUsage}`;
      this.consoleLog(chalk.yellow(thingsToLog));
    });
  }

  generateMainHelp() {
    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Commands'));
    this.consoleLog(chalk.dim('* You can run commands with "serverless" or the shortcut "sls"'));
    this.consoleLog(chalk.dim('* Pass "--verbose" to this command to get in-depth plugin info'));
    this.consoleLog(chalk.dim('* Pass "--no-color" to disable CLI colors'));
    this.consoleLog(chalk.dim('* Pass "--help" after any <command> for contextual help'));
    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Interactive Quickstart'));
    this.consoleLog(
      chalk.dim(
        `* Run serverless (or shortcut sls) without any arguments to initialize an interactive setup
  of functionalities related to given service or current environment`
      )
    );
    this.consoleLog(
      chalk.dim('* Pass "--help-interactive" for contextual help on interactive CLI options')
    );

    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Framework'));
    this.consoleLog(chalk.dim('* Documentation: http://slss.io/docs'));

    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Environment Variables'));
    this.consoleLog(chalk.dim('* Set SLS_DEBUG=* to see debugging logs'));
    this.consoleLog(chalk.dim('* Set SLS_WARNING_DISABLE=* to hide warnings from the output'));

    this.consoleLog('');
    if (!_.isEmpty(this.loadedCommands)) {
      _.forEach(this.loadedCommands, (details, command) => {
        this.displayCommandUsage(details, command);
      });
    } else {
      this.consoleLog('No commands found');
    }

    this.consoleLog('');

    // print all the installed plugins
    this.consoleLog(chalk.yellow.underline('Plugins'));

    if (this.loadedPlugins.length) {
      const sortedPlugins = _.sortBy(this.loadedPlugins, plugin => plugin.constructor.name);
      this.consoleLog(sortedPlugins.map(plugin => plugin.constructor.name).join(', '));
    } else {
      this.consoleLog('No plugins added yet');
    }
  }

  generateInteractiveCliHelp() {
    this.consoleLog(chalk.yellow.underline('Interactive CLI'));
    this.consoleLog(
      chalk.yellow(
        `Run serverless (or shortcut sls) a subcommand to initialize an interactive setup of
functionalities related to given service or current environment.`
      )
    );
    const command = this.loadedPlugins.find(plugin => plugin.constructor.name === 'InteractiveCli')
      .commands.interactiveCli;

    this.displayCommandOptions(command);
  }

  generateVerboseHelp() {
    this.consoleLog('');
    this.consoleLog(chalk.yellow.underline('Commands by plugin'));
    this.consoleLog('');

    let pluginCommands = {};

    // add commands to pluginCommands based on command's plugin
    const addToPluginCommands = cmd => {
      const pcmd = _.clone(cmd);

      // remove subcommand from clone
      delete pcmd.commands;

      // check if a plugin entry is alreay present in pluginCommands. Use the
      // existing one or create a new plugin entry.
      if (_.has(pluginCommands, pcmd.pluginName)) {
        pluginCommands[pcmd.pluginName] = pluginCommands[pcmd.pluginName].concat(pcmd);
      } else {
        pluginCommands[pcmd.pluginName] = [pcmd];
      }

      // check for subcommands
      if ('commands' in cmd) {
        _.forEach(cmd.commands, d => {
          addToPluginCommands(d);
        });
      }
    };

    // fill up pluginCommands with commands in loadedCommands
    _.forEach(this.loadedCommands, details => {
      addToPluginCommands(details);
    });

    // sort plugins alphabetically
    pluginCommands = _(pluginCommands)
      .toPairs()
      .sortBy(0)
      .fromPairs()
      .value();

    _.forEach(pluginCommands, (details, plugin) => {
      this.consoleLog(plugin);
      _.forEach(details, cmd => {
        // display command usage with single(1) indent
        this.displayCommandUsage(cmd, cmd.key.split(':').join(' '), 1);
      });
      this.consoleLog('');
    });
  }

  generateCommandsHelp(commandsArray) {
    const commandName = commandsArray.join(' ');

    // Get all the commands using getCommands() with filtered entrypoint
    // commands and reduce to the required command.
    const allCommands = this.serverless.pluginManager.getCommands();
    const command = _.reduce(
      commandsArray,
      (currentCmd, cmd) => {
        if (currentCmd.commands && cmd in currentCmd.commands) {
          return currentCmd.commands[cmd];
        }
        return null;
      },
      { commands: allCommands }
    );

    // Throw error if command not found.
    if (!command) {
      const suggestedCommand = getCommandSuggestion(commandName, allCommands);
      const errorMessage = [
        `Serverless command "${commandName}" not found. Did you mean "${suggestedCommand}"?`,
        ' Run "serverless help" for a list of all available commands.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    // print the name of the plugin
    this.consoleLog(chalk.yellow.underline(`Plugin: ${command.pluginName}`));

    this.displayCommandUsage(command, commandName);
    this.displayCommandOptions(command);

    this.consoleLog('');
    return null;
  }

  getVersionNumber() {
    this.consoleLog(`Framework Core: ${version}\nPlugin: ${enterpriseVersion}\nSDK: ${sdkVersion}`);

    const userNodeVersion = Number(process.version.split('.')[0].slice(1));
    // only show components version if user is running Node 8+
    if (userNodeVersion >= 8) {
      const { cliVersion, coreVersion } = require('@serverless/cli');
      this.consoleLog(`Components Core: ${coreVersion}\nComponents CLI: ${cliVersion}`);
    }
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

  log(message, entity, opts) {
    const underline = opts ? opts.underline : false;
    const bold = opts ? opts.bold : false;
    const color = opts ? opts.color : null;

    let print = chalk.yellow;

    if (color) print = chalk.keyword(color);
    if (underline) print = print.underline;
    if (bold) print = print.bold;

    this.consoleLog(`${entity || 'Serverless'}: ${print(message)}`);
  }

  consoleLog(message) {
    console.log(message); // eslint-disable-line no-console
  }
}

module.exports = CLI;
