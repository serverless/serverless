'use strict';

const version = require('../../package.json').version;
const enterpriseVersion = require('@serverless/enterprise-plugin/package.json').version;
const { sdkVersion } = require('@serverless/enterprise-plugin');
const _ = require('lodash');
const os = require('os');
const chalk = require('chalk');
const getCommandSuggestion = require('../utils/getCommandSuggestion');
const resolveCliInput = require('../utils/resolveCliInput');

const helpCommandNames = new Set(['help', 'version']);

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

    return resolveCliInput(inputArray);
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

  isHelpRequest(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    if (options.help || options.h) return true;

    switch (commands.length) {
      case 0:
        if (options.version || options.v) return true;
        if (options['help-interactive']) return true;
        return false;
      case 1:
        return helpCommandNames.has(commands[0]);
      default:
        return false;
    }
  }

  displayHelp(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    switch (commands.length) {
      case 0:
        if (options.version || options.v) {
          this.getVersionNumber();
          return true;
        }
        if (options['help-interactive']) {
          this.generateInteractiveCliHelp();
          return true;
        }
        if (options.verbose) this.generateVerboseHelp();
        else this.generateMainHelp();
        return true;
      case 1:
        if (commands[0] === 'version') {
          this.getVersionNumber();
          return true;
        }
        if (commands[0] === 'help') {
          if (options.verbose) this.generateVerboseHelp();
          else this.generateMainHelp();
          return true;
        }
      // fallthrough
      default:
        if (options.help || options.h) {
          this.generateCommandsHelp(commands);
          return true;
        }
        return false;
    }
  }

  displayCommandUsage(commandObject, command, indents) {
    if (commandObject.isHidden) return;
    const dotsLength = 30;

    // check if command has lifecycleEvents (can be executed) and it's not a container command
    if (commandObject.lifecycleEvents && commandObject.type !== 'container') {
      const usage = commandObject.usage;
      const dots = '.'.repeat(Math.max(dotsLength - command.length, 0));
      const indent = '  '.repeat(indents || 0);
      this.consoleLog(`${indent}${chalk.yellow(command)} ${chalk.dim(dots)} ${usage}`);
    }

    if (commandObject.commands) {
      Object.entries(commandObject.commands).forEach(([subcommand, subcommandObject]) => {
        this.displayCommandUsage(subcommandObject, `${command} ${subcommand}`, indents);
      });
    }
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
      : Object.assign({}, commandObject.options);

    Object.entries(commandOptions).forEach(([option, optionsObject]) => {
      let optionsDots = '.'.repeat(Math.max(dotsLength - option.length, 0));
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

    this.consoleLog(chalk.yellow.underline('Serverless Components'));
    this.consoleLog(
      chalk.dim(
        '* Run serverless (or shortcut sls) in context of a component service to initialize a components CLI'
      )
    );
    this.consoleLog(
      chalk.dim('* Pass "--help-components" for contextual help on Serverless Components')
    );

    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Framework'));
    this.consoleLog(chalk.dim('* Documentation: http://slss.io/docs'));

    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Environment Variables'));
    this.consoleLog(chalk.dim('* Set SLS_DEBUG=* to see debugging logs'));
    this.consoleLog(chalk.dim('* Set SLS_WARNING_DISABLE=* to hide warnings from the output'));

    this.consoleLog(
      chalk.dim(
        "* Set SLS_MAX_CONCURRENT_ARTIFACTS_UPLOADS to control the maximum S3 upload SDK requests that are sent in parallel during the deployment of the service's artifacts. The default is 3. Note: increasing this too high might, actually, downgrade the overall upload speed"
      )
    );

    this.consoleLog('');
    if (Object.keys(this.loadedCommands).length) {
      Object.entries(this.loadedCommands).forEach(([command, details]) => {
        this.displayCommandUsage(details, command);
      });
    } else {
      this.consoleLog('No commands found');
    }

    this.consoleLog('');

    // print all the installed plugins
    this.consoleLog(chalk.yellow.underline('Plugins'));

    if (this.loadedPlugins.length) {
      const sortedPlugins = this.loadedPlugins.sort((plugin1, plugin2) =>
        plugin1.constructor.name.localeCompare(plugin2.constructor.name)
      );
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

      // check if a plugin entry is already present in pluginCommands. Use the
      // existing one or create a new plugin entry.
      if (pluginCommands[pcmd.pluginName]) {
        pluginCommands[pcmd.pluginName] = pluginCommands[pcmd.pluginName].concat(pcmd);
      } else {
        pluginCommands[pcmd.pluginName] = [pcmd];
      }

      // check for subcommands
      if ('commands' in cmd) {
        Object.values(cmd.commands).forEach(d => {
          addToPluginCommands(d);
        });
      }
    };

    // fill up pluginCommands with commands in loadedCommands
    Object.values(this.loadedCommands).forEach(details => {
      addToPluginCommands(details);
    });

    // sort plugins alphabetically
    pluginCommands = _(Object.entries(pluginCommands))
      .sortBy(0)
      .fromPairs()
      .value();

    Object.entries(pluginCommands).forEach(([plugin, details]) => {
      this.consoleLog(plugin);
      details.forEach(cmd => {
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
    const command = commandsArray.reduce(
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
    const installationModePostfix = (() => {
      if (this.serverless.isStandaloneExecutable) return ' (standalone)';
      if (this.serverless.isLocallyInstalled) return ' (local)';
      return '';
    })();

    this.consoleLog(
      `Framework Core: ${version}${installationModePostfix}\n` +
        `Plugin: ${enterpriseVersion}\n` +
        `SDK: ${sdkVersion}`
    );

    const userNodeVersion = Number(process.version.split('.')[0].slice(1));
    // only show components version if user is running Node 8+
    if (userNodeVersion >= 8) {
      const componentsVersion = (() => {
        try {
          return require('@serverless/components/package').version;
        } catch (error) {
          return 'Unavailable';
        }
      })();
      this.consoleLog(`Components: ${componentsVersion}`);
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
