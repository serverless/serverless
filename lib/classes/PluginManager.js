'use strict';

const Utils = require('./Utils');
const path = require('path');
const has = require('lodash').has;
const forEach = require('lodash').forEach;

class PluginManager {
  constructor(serverless) {
    this._serverless = serverless;
    this._pluginInstances = [];
    this._commandsList = [];
    this._commands = {};
  }

  loadAllPlugins(servicePlugins) {
    this._loadCorePlugins();
    this._loadServicePlugins(servicePlugins);
  }

  runCommand(command) {
    const events = this._getEvents(command.split(' '), this._commands);
    // collect all relevant hooks
    let hooks = [];
    events.forEach((event) => {
      const hooksForEvent = [];
      this._pluginInstances.forEach((pluginInstance) => {
        forEach(pluginInstance.hooks, (hook, hookKey) => {
          // normalize the hookKey and event ("foo:beforeBar" becomes "foo:beforebar")
          const normalizedHookKey = hookKey.substr(0, hookKey.lastIndexOf(':') + 1) +
            hookKey.substr((hookKey.lastIndexOf(':')) + 1).toLowerCase();
          const normalizedEvent = event.substr(0, event.lastIndexOf(':') + 1) +
            event.substr((event.lastIndexOf(':')) + 1).toLowerCase();

          if (normalizedHookKey === normalizedEvent) {
            hooksForEvent.push(hook);
          }
        });
      });
      hooks = hooks.concat(hooksForEvent);
    });

    // run all relevant hooks one after another
    hooks.forEach((hook) => {
      const returnValue = hook();

      // check if a Promise is returned
      if (returnValue && returnValue.then instanceof Function) {
        returnValue.then((value) => {
          return value;
        });
      }
    });
  }

  _addPlugin(Plugin) {
    this._pluginInstances.push(new Plugin());

    this._loadCommands(Plugin);
  }

  _loadCorePlugins() {
    const utils = new Utils();
    const pluginsDirectoryPath = path.join(__dirname, '../plugins');

    const corePlugins = utils.readFileSync(path.join(pluginsDirectoryPath, 'Plugins.json')).plugins;

    corePlugins.forEach((corePlugin) => {
      const Plugin = require(path.join(pluginsDirectoryPath, corePlugin));

      this._addPlugin(Plugin);
    });
  }

  _loadServicePlugins(servicePlugins) {
    servicePlugins = (typeof servicePlugins !== 'undefined' ? servicePlugins : []);

    servicePlugins.forEach((servicePlugins) => {
      this._addPlugin(servicePlugins);
    });
  }

  _loadCommands(Plugin) {
    this._commandsList.push((new Plugin()).commands);

    // TODO: refactor ASAP as it slows down overall performance
    // rebuild the commands
    forEach(this._commandsList, (commands) => {
      forEach(commands, (commandDetails, command) => {
        this._commands[command] = commandDetails;
      });
    });
  }

  _getEvents(commandsArray, availableCommands, prefix) {
    prefix = (typeof prefix !== 'undefined' ? prefix : '');
    const commandPart = commandsArray[0];

    if (has(availableCommands, commandPart)) {
      const commandDetails = availableCommands[commandPart];
      if (commandsArray.length === 1) {
        const events = [];
        commandDetails.lifeCycleEvents.forEach((event) => {
          events.push(`${prefix}${commandPart}:before${event.charAt(0).toUpperCase() + event.slice(1)}`);
          events.push(`${prefix}${commandPart}:${event}`);
          events.push(`${prefix}${commandPart}:after${event.charAt(0).toUpperCase() + event.slice(1)}`);
        });
        return events;
      }
      if (has(commandDetails, 'commands')) {
        return this._getEvents(commandsArray.slice(1, commandsArray.length),
          commandDetails.commands, `${commandPart}:`);
      }
    }

    return [];
  }
}

module.exports = PluginManager;
