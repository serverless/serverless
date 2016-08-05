'use strict';

const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = null;
    this.cliOptions = {};
    this.cliCommands = [];

    this.plugins = [];
    this.commandsList = [];
    this.commands = {};
  }

  setProvider(provider) {
    this.provider = provider;
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
      const errorMessage = [
        `command "${commandsArray[0]}" not found`,
        ' Run "serverless help" for a list of all available commands.',
      ].join();
      throw new this.serverless.classes.Error(errorMessage);
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

    _.forEach(options, (value, key) => {
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
        // if a provider is given it should only add the hook when the plugins provider matches
        // the services provider
        if (!pluginInstance.provider || (pluginInstance.provider === this.provider)) {
          _.forEach(pluginInstance.hooks, (hook, hookKey) => {
            if (hookKey === event) {
              // use arrow fn. to pass the hook with options rather than calling it
              hooksForEvent.push(() => hook());
            }
          });
        }
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
    // TODO: implement an option to get deeper than two levels
    // check if the command entered is the one in the commands object which holds all commands
    // this is necessary so that shortcuts are not treated like global citizens but command
    // bound properties
    if (this.cliCommands.length === 1) {
      _.forEach(commands, (firstCommand, firstCommandKey) => {
        if (_.includes(this.cliCommands, firstCommandKey)) {
          _.forEach(firstCommand.options, (optionObject, optionKey) => {
            if (optionObject.shortcut && _.includes(Object.keys(cliOptions),
                optionObject.shortcut)) {
              Object.keys(cliOptions).forEach((option) => {
                if (option === optionObject.shortcut) {
                  this.cliOptions[optionKey] = this.cliOptions[option];
                }
              });
            }
          });
        }
      });
    } else if (this.cliCommands.length === 2) {
      _.forEach(commands, (firstCommand) => {
        _.forEach(firstCommand.commands, (secondCommand, secondCommandKey) => {
          if (_.includes(this.cliCommands, secondCommandKey)) {
            _.forEach(secondCommand.options, (optionObject, optionKey) => {
              if (optionObject.shortcut && _.includes(Object.keys(cliOptions),
                  optionObject.shortcut)) {
                Object.keys(cliOptions).forEach((option) => {
                  if (option === optionObject.shortcut) {
                    this.cliOptions[optionKey] = this.cliOptions[option];
                  }
                });
              }
            });
          }
        });
      });
    }
  }

  addPlugin(Plugin) {
    const pluginInstance = new Plugin(this.serverless, this.cliOptions);

    this.loadCommands(pluginInstance);

    // shortcuts should be converted into options so that the plugin
    // author can use the option (instead of the shortcut)
    this.convertShortcutsIntoOptions(this.cliOptions, this.commands);

    this.plugins.push(pluginInstance);
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

    // we want to load plugins installed locally in the service
    if (this.serverless && this.serverless.config && this.serverless.config.servicePath) {
      module.paths.unshift(path.join(this.serverless.config.servicePath, 'node_modules'));
    }

    servicePlugins.forEach((servicePlugin) => {
      const Plugin = require(servicePlugin); // eslint-disable-line global-require

      this.addPlugin(Plugin);
    });

    // restore module paths
    if (this.serverless && this.serverless.config && this.serverless.config.servicePath) {
      module.paths.shift();
    }
  }

  loadCommands(pluginInstance) {
    this.commandsList.push(pluginInstance.commands);

    // TODO: refactor ASAP as it slows down overall performance
    // rebuild the commands
    _.forEach(this.commandsList, (commands) => {
      _.forEach(commands, (commandDetails, command) => {
        this.commands[command] = commandDetails;
      });
    });
  }

  getEvents(commandsArray, availableCommands, pre) {
    const prefix = (typeof pre !== 'undefined' ? pre : '');
    const commandPart = commandsArray[0];

    if (_.has(availableCommands, commandPart)) {
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
      if (_.has(commandDetails, 'commands')) {
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
