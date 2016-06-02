'use strict';

const path = require('path');
const has = require('lodash').has;
const forEach = require('lodash').forEach;

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;
    this.plugins = [];
    this.commandsList = [];
    this.commands = {};
  }

  loadAllPlugins(servicePlugins) {
    this.loadCorePlugins();
    this.loadServicePlugins(servicePlugins);
  }

  run(commandsArray, optionsArray) {
    const events = this.getEvents(commandsArray, this.commands);
    // collect all relevant hooks
    let hooks = [];
    events.forEach((event) => {
      const hooksForEvent = [];
      this.plugins.forEach((pluginInstance) => {
        forEach(pluginInstance.hooks, (hook, hookKey) => {
          if (hookKey === event) {
            hooksForEvent.push(hook);
          }
        });
      });
      hooks = hooks.concat(hooksForEvent);
    });

    if (hooks.length === 0) {
      throw new Error('The command you entered was not found. Did you spell it correctly?');
    }

    // run all relevant hooks one after another
    hooks.forEach((hook) => {
      const returnValue = hook(optionsArray);

      // check if a Promise is returned
      if (returnValue && returnValue.then instanceof Function) {
        returnValue.then((value) => value);
      }
    });
  }

  addPlugin(Plugin) {
    this.plugins.push(new Plugin(this.serverless));

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
