'use strict';

const version = require('../../package.json').version;
const os = require('os');
const chalk = require('chalk');
const { log } = require('@serverless/utils/log');
const resolveCliInput = require('../cli/resolve-input');
const renderHelp = require('../cli/render-help');

const legacyPluginLog = log.get('plugin-legacy');

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
    const { underline = false, bold = false, color = null } = opts || {};

    let print = chalk;

    if (color) print = chalk.keyword(color);
    if (underline) print = print.underline;
    if (bold) print = print.bold;

    legacyPluginLog.notice(entity ? `${entity}: ${print(message)}` : print(message));
  }

  consoleLog(message) {
    process.stdout.write(`${message}\n`);
  }
}

module.exports = CLI;
