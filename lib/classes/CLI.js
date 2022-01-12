'use strict';

const version = require('../../package.json').version;
const os = require('os');
const chalk = require('chalk');
const log = require('@serverless/utils/log');
const resolveCliInput = require('../cli/resolve-input');
const renderHelp = require('../cli/render-help');

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

  displayHelp() {
    if (!resolveCliInput().isHelpRequest) return false;
    renderHelp(this.serverless.pluginManager.externalPlugins);
    return true;
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
    log(message, { ...opts, entity: entity || 'Serverless' });
  }

  consoleLog(message) {
    process.stdout.write(`${message}\n`);
  }
}

module.exports = CLI;
