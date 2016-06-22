'use strict';

const path = require('path');
const has = require('lodash').has;
const forEach = require('lodash').forEach;
const BbPromise = require('bluebird');

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;
    this.plugins = [];
    this.commandsList = [];
    this.commands = {};
    this.options = {};
  }

  setOptions(options) {
    this.options = options;
  }

  loadAllPlugins(servicePlugins) {
    this.loadCorePlugins();
    this.loadServicePlugins(servicePlugins);
  }

  validateOptions(commandsArray) {
    let options;

    // TODO: implement an option to get deeper that two levels
    if (commandsArray.length === 1) {
      options = this.commands[commandsArray[0]].options;
    } else {
      options = this.commands[commandsArray[0]].commands[commandsArray[1]].options;
    }

    forEach(options, (value, key) => {
      if (value.required && (this.options[key] === true || !(this.options[key]))) {
        const errorMessage =
     `
     This command requires the --${key} option. Please pass
     it through. :)
     `;
        throw new this.serverless.classes.Error(errorMessage);
      }
    });
  }

  run(commandsArray) {
    // check if all options are passed
    this.validateOptions(commandsArray);

    const events = this.getEvents(commandsArray, this.commands);
    // collect all relevant hooks
    let hooks = [];
    events.forEach((event) => {
      const hooksForEvent = [];
      this.plugins.forEach((pluginInstance) => {
        forEach(pluginInstance.hooks, (hook, hookKey) => {
          if (hookKey === event) {
            // use arrow fn. to pass the hook with options rather than calling it
            hooksForEvent.push(() => hook());
          }
        });
      });
      hooks = hooks.concat(hooksForEvent);
    });

    if (hooks.length === 0) {
      const errorMessage =
     `
     The command you entered was not found.
     Did you spell it correctly?
     `;
      throw new this.serverless.classes.Error(errorMessage);
    }

    // using arr.reduce to sequentially run promises in array in order
    // BbPromise.all doesn't guarantee sequence or order,
    // it just waits for the entire array to finish. Not what we need here
    return hooks.reduce((p, fn) => p.then(fn), BbPromise.resolve());
  }

  addPlugin(Plugin) {
    this.plugins.push(new Plugin(this.serverless, this.options));

    this.loadCommands(Plugin);
  }

  loadCorePlugins() {
    const pluginsDirectoryPath = path.join(__dirname, '../plugins');

    const corePlugins = this.serverless.utils
      .readFileSync(path.join(pluginsDirectoryPath, 'Plugins.json')).plugins;

    corePlugins.forEach((corePlugin) => {
      const Plugin = require(path // eslint-disable-line global-require
        .join(pluginsDirectoryPath, corePlugin));

      this.addPlugin(Plugin);
    });
  }

  loadServicePlugins(servicePlugs) {
    const servicePlugins = (typeof servicePlugs !== 'undefined' ? servicePlugs : []);

    servicePlugins.forEach((servicePlugin) => {
      this.addPlugin(servicePlugin);
    });
  }

  loadCommands(Plugin) {
    this.commandsList.push((new Plugin(this.serverless)).commands);

    // TODO: refactor ASAP as it slows down overall performance
    // rebuild the commands
    forEach(this.commandsList, (commands) => {
      forEach(commands, (commandDetails, command) => {
        this.commands[command] = commandDetails;
      });
    });
  }

  getEvents(commandsArray, availableCommands, pre) {
    const prefix = (typeof pre !== 'undefined' ? pre : '');
    const commandPart = commandsArray[0];

    if (has(availableCommands, commandPart)) {
      const commandDetails = availableCommands[commandPart];
      if (commandsArray.length === 1) {
        const events = [];
        commandDetails.lifecycleEvents.forEach((event) => {
          events.push(`before:${prefix}${commandPart}:${event}`);
          events.push(`${prefix}${commandPart}:${event}`);
          events.push(`after:${prefix}${commandPart}:${event}`);
        });
        return events;
      }
      if (has(commandDetails, 'commands')) {
        return this.getEvents(commandsArray.slice(1, commandsArray.length),
          commandDetails.commands, `${commandPart}:`);
      }
    }

    return [];
  }

  getPlugins() {
    return this.plugins;
  }
}

module.exports = PluginManager;
