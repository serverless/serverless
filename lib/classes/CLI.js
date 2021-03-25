'use strict';

const version = require('../../package.json').version;
const os = require('os');
const chalk = require('chalk');
const resolveCliInput = require('../cli/resolve-input');
const renderInteractiveSetupHelp = require('../cli/render-help/interactive-setup');
const renderGeneralHelp = require('../cli/render-help/general');
const renderCommandHelp = require('../cli/render-help/command');

class CLI {
  constructor(serverless) {
    this.serverless = serverless;
    this.loadedPlugins = [];
    this.loadedCommands = {};
  }

  setLoadedPlugins(plugins) {
    this.loadedPlugins = plugins;
  }

  setLoadedCommands(commands) {
    this.loadedCommands = commands;
  }

  suppressLogIfPrintCommand(processedInput) {
    const commands = processedInput.commands;

    // if "-help" or "-h" was entered
    if (resolveCliInput().isHelpRequest) return;

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
    this.log = function () {};
  }

  displayHelp(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    switch (commands.length) {
      case 0:
        if (options['help-interactive']) {
          renderInteractiveSetupHelp();
          return true;
        }
        renderGeneralHelp(this.serverless.pluginManager.externalPlugins);
        return true;
      case 1:
        if (commands[0] === 'help') {
          renderGeneralHelp(this.serverless.pluginManager.externalPlugins);
          return true;
        }
      // fallthrough
      default:
        if (options.help || options.h) {
          renderCommandHelp(commands.join(' '));
          return true;
        }
        return false;
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
