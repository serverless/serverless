'use strict';

const path = require('path');
const Module = require('module');
const BbPromise = require('bluebird');
const _ = require('lodash');
const writeFile = require('../utils/fs/writeFile');
const getCacheFilePath = require('../utils/getCacheFilePath');
const getServerlessConfigFile = require('../utils/getServerlessConfigFile');
const crypto = require('crypto');
const getCommandSuggestion = require('../utils/getCommandSuggestion');

/**
 * @private
 * Error type to terminate the currently running hook chain successfully without
 * executing the rest of the current command's lifecycle chain.
 */
class TerminateHookChain extends Error {
  constructor(commands) {
    const commandChain = _.join(commands, ':');
    const message = `Terminating ${commandChain}`;

    super(message);
    this.message = message;
    this.name = 'TerminateHookChain';
  }
}

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;

    this.cliOptions = {};
    this.cliCommands = [];

    this.plugins = [];
    this.commands = {};
    this.aliases = {};
    this.hooks = {};
    this.deprecatedEvents = {};
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
      if (_.isString(pluginInstance.provider)) {
        pluginProvider = pluginInstance.provider;
      } else if (_.isObject(pluginInstance.provider)) {
        pluginProvider = pluginInstance.provider.constructor.getProviderName();
      }
    }

    // ignore plugins that specify a different provider than the current one
    if (pluginProvider
      && (pluginProvider !== this.serverless.service.provider.name)) {
      return;
    }

    // don't load plugins twice
    if (this.plugins.some(plugin => plugin instanceof Plugin)) {
      this.serverless.cli.log(`WARNING: duplicate plugin ${Plugin.name} was not loaded\n`);
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
      try {
        const Plugin = require(plugin); // eslint-disable-line global-require

        this.addPlugin(Plugin);
      } catch (error) {
        if (this.cliCommands[0] === 'plugin') {
          return;
        }
        let errorMessage;
        if (error && error.code === 'MODULE_NOT_FOUND' && error.message.endsWith(`'${plugin}'`)) {
          // Plugin not installed
          errorMessage = [
            `Serverless plugin "${plugin}" not found.`,
            ' Make sure it\'s installed and listed in the "plugins" section',
            ' of your serverless config file.',
          ].join('');
        } else {
          // Plugin initialization error
          // Rethrow the original error in case we're in debug mode.
          if (process.env.SLS_DEBUG) {
            throw error;
          }
          errorMessage =
            `Serverless plugin "${plugin}" initialization errored: ${error.message}`;
        }
        if (!this.cliOptions.help) {
          throw new this.serverless.classes.Error(errorMessage);
        }

        this.serverless.cli.log(`WARNING: ${errorMessage}\n`);
      }
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
    // eslint-disable-next-line no-underscore-dangle
    module.paths = Module._nodeModulePaths(process.cwd());

    const pluginsObject = this.parsePluginsObject(servicePlugs);
    // we want to load plugins installed locally in the service
    if (pluginsObject.localPath) {
      module.paths.unshift(pluginsObject.localPath);
    }
    this.loadPlugins(pluginsObject.modules);
  }

  parsePluginsObject(servicePlugs) {
    let localPath = (this.serverless && this.serverless.config &&
      this.serverless.config.servicePath) &&
      path.join(this.serverless.config.servicePath, '.serverless_plugins');
    let modules = [];

    if (_.isArray(servicePlugs)) {
      modules = servicePlugs;
    } else if (servicePlugs) {
      localPath = servicePlugs.localPath &&
        _.isString(servicePlugs.localPath) ? servicePlugs.localPath : localPath;
      if (_.isArray(servicePlugs.modules)) {
        modules = servicePlugs.modules;
      }
    }

    return { modules, localPath };
  }

  createCommandAlias(alias, command) {
    // Deny self overrides
    if (_.startsWith(command, alias)) {
      throw new this.serverless.classes
        .Error(`Command "${alias}" cannot be overriden by an alias`);
    }

    const splitAlias = _.split(alias, ':');
    const aliasTarget = _.reduce(splitAlias, (__, aliasPath) => {
      const currentAlias = __;
      if (!currentAlias[aliasPath]) {
        currentAlias[aliasPath] = {};
      }
      return currentAlias[aliasPath];
    }, this.aliases);
    // Check if the alias is already defined
    if (aliasTarget.command) {
      throw new this.serverless.classes
        .Error(`Alias "${alias}" is already defined for command ${aliasTarget.command}`);
    }
    // Check if the alias would overwrite an exiting command
    if (_.reduce(splitAlias, (__, aliasPath) => {
      if (!__ || !__.commands || !__.commands[aliasPath]) {
        return null;
      }
      return __.commands[aliasPath];
    }, this)) {
      throw new this.serverless.classes
        .Error(`Command "${alias}" cannot be overriden by an alias`);
    }
    aliasTarget.command = command;
  }

  loadCommand(pluginName, details, key, isEntryPoint) {
    const commandIsEntryPoint = details.type === 'entrypoint' || isEntryPoint;
    if (process.env.SLS_DEBUG && !commandIsEntryPoint) {
      this.serverless.cli.log(`Load command ${key}`);
    }
    // Check if there is already an alias for the same path as the command
    const aliasCommand = this.getAliasCommandTarget(_.split(key, ':'));
    if (aliasCommand) {
      throw new this.serverless.classes
        .Error(`Command "${key}" cannot override an existing alias`);
    }
    // Load the command
    const commands = _.mapValues(details.commands, (subDetails, subKey) =>
      this.loadCommand(
        pluginName,
        subDetails,
        `${key}:${subKey}`,
        commandIsEntryPoint
      )
    );
    // Handle command aliases
    _.forEach(details.aliases, alias => {
      if (process.env.SLS_DEBUG) {
        this.serverless.cli.log(`  -> @${alias}`);
      }
      this.createCommandAlias(alias, key);
    });
    return _.assign({}, details, { key, pluginName, commands });
  }

  loadCommands(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    _.forEach(pluginInstance.commands, (details, key) => {
      const command = this.loadCommand(pluginName, details, key);
      // Grab and extract deprecated events
      command.lifecycleEvents = _.map(command.lifecycleEvents, event => {
        if (_.startsWith(event, 'deprecated#')) {
          // Extract event and optional redirect
          const transformedEvent = /^deprecated#(.*?)(?:->(.*?))?$/.exec(event);
          this.deprecatedEvents[`${command.key}:${transformedEvent[1]}`] =
            transformedEvent[2] || null;
          return transformedEvent[1];
        }
        return event;
      });
      this.commands[key] = _.merge({}, this.commands[key], command);
    });
  }

  loadHooks(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    _.forEach(pluginInstance.hooks, (hook, event) => {
      let target = event;
      const baseEvent = _.replace(event, /^(?:after:|before:)/, '');
      if (_.has(this.deprecatedEvents, baseEvent)) {
        const redirectedEvent = this.deprecatedEvents[baseEvent];
        if (process.env.SLS_DEBUG) {
          this.serverless.cli.log(`WARNING: Plugin ${pluginName} uses deprecated hook ${event},
                     use ${redirectedEvent} hook instead`);
        }
        if (redirectedEvent) {
          target = _.replace(event, baseEvent, redirectedEvent);
        }
      }
      this.hooks[target] = this.hooks[target] || [];
      this.hooks[target].push({
        pluginName,
        hook,
      });
    });
  }

  getCommands() {
    const result = {};

    // Iterate through the commands and stop at entrypoints to include only public
    // command throughout the hierarchy.
    const stack = [{ commands: this.commands, target: result }];
    while (!_.isEmpty(stack)) {
      const currentCommands = stack.pop();
      const commands = currentCommands.commands;
      const target = currentCommands.target;
      _.forOwn(commands, (command, name) => {
        if (command.type !== 'entrypoint') {
          _.set(target, name, _.omit(command, 'commands'));
          if (_.some(command.commands, childCommand => childCommand.type !== 'entrypoint')) {
            target[name].commands = {};
            stack.push({ commands: command.commands, target: target[name].commands });
          }
        }
      });
    }
    // Iterate through the existing aliases and add them as commands
    _.remove(stack);
    stack.push({ aliases: this.aliases, target: result });
    while (!_.isEmpty(stack)) {
      const currentAlias = stack.pop();
      const aliases = currentAlias.aliases;
      const target = currentAlias.target;
      _.forOwn(aliases, (alias, name) => {
        if (name === 'command') {
          return;
        }
        if (alias.command) {
          const commandPath = _.join(_.split(alias.command, ':'), '.commands.');
          _.set(target, name, _.get(this.commands, commandPath));
        } else {
          target[name] = target[name] || {};
          target[name].commands = target[name].commands || {};
        }
        stack.push({ aliases: alias, target: target[name].commands });
      });
    }
    return result;
  }

  getAliasCommandTarget(aliasArray) {
    // Check if the command references an alias
    const aliasCommand = _.reduce(
      aliasArray,
      (__, commandPath) => {
        if (!__ || !__[commandPath]) {
          return null;
        }
        return __[commandPath];
      },
      this.aliases
    );

    return _.get(aliasCommand, 'command');
  }

  /**
   * Retrieve the command specified by a command list. The method can be configured
   * to include entrypoint commands (which are invisible to the CLI and can only
   * be used by plugins).
   * @param commandsArray {Array<String>} Commands
   * @param allowEntryPoints {undefined|boolean} Allow entrypoint commands to be returned
   * @returns {Object} Command
   */
  getCommand(commandsArray, allowEntryPoints) {
    // Check if the command references an alias
    const aliasCommandTarget = this.getAliasCommandTarget(commandsArray);
    const commandOrAlias = aliasCommandTarget ? _.split(aliasCommandTarget, ':') : commandsArray;
    return _.reduce(commandOrAlias, (current, name, index) => {
      if (name in current.commands &&
         (allowEntryPoints || current.commands[name].type !== 'entrypoint')) {
        return current.commands[name];
      }
      const commandName = commandOrAlias.slice(0, index + 1).join(' ');
      const suggestedCommand = getCommandSuggestion(commandName,
        this.serverless.cli.loadedCommands);
      const errorMessage = [
        `Serverless command "${commandName}" not found. Did you mean "${suggestedCommand}"?`,
        ' Run "serverless help" for a list of all available commands.',
      ].join('');
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

  getHooks(events) {
    return _.flatMap([].concat(events), (event) => this.hooks[event] || []);
  }

  invoke(commandsArray, allowEntryPoints) {
    const command = this.getCommand(commandsArray, allowEntryPoints);

    this.convertShortcutsIntoOptions(command);
    this.assignDefaultOptions(command);
    this.validateOptions(command);

    const events = this.getEvents(command);
    const hooks = this.getHooks(events);

    if (process.env.SLS_DEBUG) {
      this.serverless.cli.log(`Invoke ${_.join(commandsArray, ':')}`);
      if (hooks.length === 0) {
        const warningMessage = 'Warning: The command you entered did not catch on any hooks';
        this.serverless.cli.log(warningMessage);
      }
    }

    return BbPromise.reduce(hooks, (__, hook) => hook.hook(), null)
    .catch(TerminateHookChain, () => {
      if (process.env.SLS_DEBUG) {
        this.serverless.cli.log(`Terminate ${_.join(commandsArray, ':')}`);
      }
      return BbPromise.resolve();
    });
  }

  /**
   * Invokes the given command and starts the command's lifecycle.
   * This method can be called by plugins directly to spawn a separate sub lifecycle.
   */
  spawn(commandsArray, options) {
    let commands = commandsArray;
    if (_.isString(commandsArray)) {
      commands = _.split(commandsArray, ':');
    }
    return this.invoke(commands, true)
    .then(() => {
      if (_.get(options, 'terminateLifecycleAfterExecution', false)) {
        return BbPromise.reject(new TerminateHookChain(commands));
      }
      return BbPromise.resolve();
    });
  }

  /**
   * Called by the CLI to start a public command.
   */
  run(commandsArray) {
    return this.invoke(commandsArray);
  }

  /**
   * Check if the command is valid. Internally this function will only find
   * CLI accessible commands (command.type !== 'entrypoint')
   */
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
        _.isString(value.customValidation.errorMessage) &&
        !value.customValidation.regularExpression.test(this.cliOptions[key])) {
        throw new this.serverless.classes.Error(value.customValidation.errorMessage);
      }
    });
  }

  updateAutocompleteCacheFile() {
    const commands = _.clone(this.getCommands());
    const cacheFile = {
      commands: {},
      validationHash: '',
    };

    _.forEach(commands, (commandObj, commandName) => {
      const command = commandObj;
      if (!command.options) {
        command.options = {};
      }
      if (!command.commands) {
        command.commands = {};
      }
      cacheFile.commands[commandName] = Object.keys(command.options)
        .map(option => `--${option}`)
        .concat(Object.keys(command.commands));
    });

    const servicePath = this.serverless.config.servicePath || 'x';
    return getServerlessConfigFile(servicePath)
      .then((serverlessConfigFile) => {
        const serverlessConfigFileHash = crypto.createHash('sha256')
          .update(JSON.stringify(serverlessConfigFile)).digest('hex');
        cacheFile.validationHash = serverlessConfigFileHash;
        const cacheFilePath = getCacheFilePath(servicePath);
        return writeFile(cacheFilePath, cacheFile);
      })
      .catch((e) => null);  // eslint-disable-line
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

  assignDefaultOptions(command) {
    _.forEach(command.options, (value, key) => {
      if (value.default && (!this.cliOptions[key] || this.cliOptions[key] === true)) {
        this.cliOptions[key] = value.default;
      }
    });
  }
}

module.exports = PluginManager;
