'use strict';

const path = require('path');
const has = require('lodash').has;
const forEach = require('lodash').forEach;
const includes = require('lodash').includes;
const BbPromise = require('bluebird');

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;
    this.plugins = [];
    this.commandsList = [];
    this.commands = {};
    this.cliOptions = {};
    this.cliCommands = [];
  }

  setCliOptions(options) {
    this.cliOptions = options;
  }

  setCliCommands(commands) {
    this.cliCommands = commands;
  }

  loadAllPlugins(servicePlugins) {
    this.loadCorePlugins();
    this.loadServicePlugins(servicePlugins);
  }

  validateCommands(commandsArray) {
    // TODO: implement an option to get deeper than one level
    if (!this.commands[commandsArray[0]]) {
      throw new this.serverless.classes.Error(`command "${commandsArray[0]}" not found.`);
    }
  }

  validateOptions(commandsArray) {
    let options;

    // TODO: implement an option to get deeper than two levels
    if (commandsArray.length === 1) {
      options = this.commands[commandsArray[0]].options;
    } else {
      options = this.commands[commandsArray[0]].commands[commandsArray[1]].options;
    }

    forEach(options, (value, key) => {
      if (value.required && (this.cliOptions[key] === true || !(this.cliOptions[key]))) {
        let requiredThings = `the --${key} option`;
        if (value.shortcut) {
          requiredThings += ` / -${value.shortcut} shortcut`;
        }
        const errorMessage = `This command requires ${requiredThings}.`;

        throw new this.serverless.classes.Error(errorMessage);
      }
    });
  }

  run(commandsArray) {
    // check if the command the user has entered is provided through a plugin
    this.validateCommands(commandsArray);

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
      const errorMessage = `The command you entered was not found.
     Did you spell it correctly?`;
      throw new this.serverless.classes.Error(errorMessage);
    }

    // using arr.reduce to sequentially run promises in array in order
    // BbPromise.all doesn't guarantee sequence or order,
    // it just waits for the entire array to finish. Not what we need here
    return hooks.reduce((p, fn) => p.then(fn), BbPromise.resolve());
  }

  convertShortcutsIntoOptions(cliOptions, commands) {
    forEach(commands, (command, commandKey) => {
      // TODO: add support for nested commands
      // check if the command entered is the one in the commands object which holds all commands
      // this is necessary so that shortcuts are not treated like global citizens but command
      // bound properties
      if (includes(this.cliCommands, commandKey)) {
        forEach(command.options, (optionObject, optionKey) => {
          if (optionObject.shortcut && includes(Object.keys(cliOptions), optionObject.shortcut)) {
            Object.keys(cliOptions).forEach((option) => {
              if (option === optionObject.shortcut) {
                this.cliOptions[optionKey] = this.cliOptions[option];
              }
            });
          }
        });
      }
    });
  }

  addPlugin(Plugin) {
    this.loadCommands(Plugin);

    // shortcuts should be converted into options so that the plugin
    // author can use the option (instead of the shortcut)
    this.convertShortcutsIntoOptions(this.cliOptions, this.commands);

    this.plugins.push(new Plugin(this.serverless, this.cliOptions));
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
