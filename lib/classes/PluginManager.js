'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const _ = require('lodash');

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;

    this.cliOptions = {};
    this.cliCommands = [];

    this.plugins = [];
    this.commands = {};
    this.hooks = {};
  }

  setCliOptions(options) {
    this.cliOptions = options;
  }

  setCliCommands(commands) {
    this.cliCommands = commands;
  }

  addPlugin(Plugin) {
    const pluginInstance = new Plugin(this.serverless, this.cliOptions);

    let pluginProvider = null;
    // check if plugin is provider agnostic
    if (pluginInstance.provider) {
      if (typeof pluginInstance.provider === 'string') {
        pluginProvider = pluginInstance.provider;
      } else if (typeof pluginInstance.provider === 'object') {
        pluginProvider = pluginInstance.provider.constructor.getProviderName();
      }
    }

    // ignore plugins that specify a different provider than the current one
    if (pluginProvider
      && (pluginProvider !== this.serverless.service.provider.name)) {
      return;
    }

    this.loadCommands(pluginInstance);
    this.loadHooks(pluginInstance);

    this.plugins.push(pluginInstance);
  }

  loadAllPlugins(servicePlugins) {
    this.loadCorePlugins();
    this.loadServicePlugins(servicePlugins);
  }

  loadPlugins(plugins) {
    plugins.forEach((plugin) => {
      const Plugin = require(plugin); // eslint-disable-line global-require

      this.addPlugin(Plugin);
    });
  }

  loadCorePlugins() {
    const pluginsDirectoryPath = path.join(__dirname, '../plugins');

    const corePlugins = this.serverless.utils
      .readFileSync(path.join(pluginsDirectoryPath, 'Plugins.json')).plugins
      .map((corePluginPath) => path.join(pluginsDirectoryPath, corePluginPath));

    this.loadPlugins(corePlugins);
  }

  loadServicePlugins(servicePlugs) {
    const servicePlugins = Array.isArray(servicePlugs) ? servicePlugs : [];

    // we want to load plugins installed locally in the service
    if (this.serverless && this.serverless.config && this.serverless.config.servicePath) {
      module.paths.unshift(
        path.join(this.serverless.config.servicePath, 'node_modules'),
        path.join(this.serverless.config.servicePath, '.serverless_plugins')
        );
    }

    this.loadPlugins(servicePlugins);

    // restore module paths
    if (this.serverless && this.serverless.config && this.serverless.config.servicePath) {
      module.paths.shift();
    }
  }

  loadCommand(pluginName, details, key) {
    const commands = _.mapValues(details.commands, (subDetails, subKey) =>
      this.loadCommand(pluginName, subDetails, `${key}:${subKey}`)
    );
    return _.assign({}, details, { key, pluginName, commands });
  }

  loadCommands(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    _.forEach(pluginInstance.commands, (details, key) => {
      const command = this.loadCommand(pluginName, details, key);
      this.commands[key] = _.merge({}, this.commands[key], command);
    });
  }

  loadHooks(pluginInstance) {
    _.forEach(pluginInstance.hooks, (hook, event) => {
      this.hooks[event] = this.hooks[event] || [];
      this.hooks[event].push(hook);
    });
  }

  getCommands() {
    return this.commands;
  }

  getCommand(commandsArray) {
    return _.reduce(commandsArray, (current, name, index) => {
      if (name in current.commands) {
        return current.commands[name];
      }
      const commandName = commandsArray.slice(0, index + 1).join(' ');
      const errorMessage = [
        `Command "${commandName}" not found`,
        ' Run "serverless help" for a list of all available commands.',
      ].join();
      throw new this.serverless.classes.Error(errorMessage);
    }, { commands: this.commands });
  }

  getEvents(command) {
    return _.flatMap(command.lifecycleEvents, (event) => [
      `before:${command.key}:${event}`,
      `${command.key}:${event}`,
      `after:${command.key}:${event}`,
    ]);
  }

  getPlugins() {
    return this.plugins;
  }

  run(commandsArray) {
    const command = this.getCommand(commandsArray);

    this.convertShortcutsIntoOptions(command);
    this.validateOptions(command);

    const events = this.getEvents(command);
    const hooks = _.flatMap(events, (event) => this.hooks[event] || []);

    if (hooks.length === 0) {
      const errorMessage = 'The command you entered did not catch on any hooks';
      throw new this.serverless.classes.Error(errorMessage);
    }

    return BbPromise.reduce(hooks, (__, hook) => hook(), null);
  }

  validateCommand(commandsArray) {
    this.getCommand(commandsArray);
  }

  validateOptions(command) {
    _.forEach(command.options, (value, key) => {
      if (value.required && (this.cliOptions[key] === true || !(this.cliOptions[key]))) {
        let requiredThings = `the --${key} option`;

        if (value.shortcut) {
          requiredThings += ` / -${value.shortcut} shortcut`;
        }
        let errorMessage = `This command requires ${requiredThings}.`;

        if (value.usage) {
          errorMessage = `${errorMessage} Usage: ${value.usage}`;
        }

        throw new this.serverless.classes.Error(errorMessage);
      }

      if (_.isPlainObject(value.customValidation) &&
        value.customValidation.regularExpression instanceof RegExp &&
        typeof value.customValidation.errorMessage === 'string' &&
        !value.customValidation.regularExpression.test(this.cliOptions[key])) {
        throw new this.serverless.classes.Error(value.customValidation.errorMessage);
      }
    });
  }

  convertShortcutsIntoOptions(command) {
    _.forEach(command.options, (optionObject, optionKey) => {
      if (optionObject.shortcut && _.includes(Object.keys(this.cliOptions),
          optionObject.shortcut)) {
        Object.keys(this.cliOptions).forEach((option) => {
          if (option === optionObject.shortcut) {
            this.cliOptions[optionKey] = this.cliOptions[option];
          }
        });
      }
    });
  }

}

module.exports = PluginManager;
