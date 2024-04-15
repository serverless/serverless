import chalk from 'chalk';
import utils from '@serverlessinc/sf-core/src/utils.js';

const { log } = utils;
const legacyPluginLog = log.get('sls:cli:plugin-legacy-log');

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

export default CLI;
