'use strict';

const path = require('path');
const config = require('../utils/config');
const cjsResolve = require('ncjsm/resolve/sync');
const BbPromise = require('bluebird');
const _ = require('lodash');
const crypto = require('crypto');
const isModuleNotFoundError = require('ncjsm/is-module-not-found-error');
const writeFile = require('../utils/fs/writeFile');
const getCacheFilePath = require('../utils/getCacheFilePath');
const serverlessConfigFileUtils = require('../utils/getServerlessConfigFile');
const getCommandSuggestion = require('../utils/getCommandSuggestion');

const requireServicePlugin = (servicePath, pluginPath, localPluginsPath) => {
  if (localPluginsPath && !pluginPath.startsWith('./')) {
    // TODO (BREAKING): Consider removing support for localPluginsPath with next major
    const absoluteLocalPluginPath = path.join(localPluginsPath, pluginPath);
    try {
      return require(absoluteLocalPluginPath);
    } catch (error) {
      if (!isModuleNotFoundError(error, absoluteLocalPluginPath)) throw error;
    }
  }
  return require(cjsResolve(servicePath, pluginPath).realPath);
};

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
    this.serverlessConfigFile = null;

    this.cliOptions = {};
    this.cliCommands = [];

    this.plugins = [];
    this.commands = {};
    this.aliases = {};
    this.hooks = {};
    this.deprecatedEvents = {};
  }

  loadConfigFile() {
    return serverlessConfigFileUtils
      .getServerlessConfigFile(this.serverless)
      .then(serverlessConfigFile => {
        this.serverlessConfigFile = serverlessConfigFile;
        return;
      });
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
    if (pluginProvider && pluginProvider !== this.serverless.service.provider.name) {
      return;
    }

    // don't load plugins twice
    if (this.plugins.some(plugin => plugin instanceof Plugin)) {
      this.serverless.cli.log(`WARNING: duplicate plugin ${Plugin.name} was not loaded\n`);
      return;
    }

    this.loadCommands(pluginInstance);
    this.loadHooks(pluginInstance);
    this.loadVariableResolvers(pluginInstance);

    this.plugins.push(pluginInstance);
  }

  loadAllPlugins(servicePlugins) {
    [
      ...require('../plugins'),
      ...this.resolveServicePlugins(servicePlugins),
      this.resolveEnterprisePlugin(),
    ]
      .filter(Boolean)
      .forEach(Plugin => this.addPlugin(Plugin));
    return this.asyncPluginInit();
  }

  resolveServicePlugins(servicePlugs) {
    const pluginsObject = this.parsePluginsObject(servicePlugs);
    const servicePath = this.serverless.config.servicePath;
    return pluginsObject.modules
      .filter(name => name !== '@serverless/enterprise-plugin')
      .map(name => {
        let Plugin;
        try {
          Plugin = requireServicePlugin(servicePath, name, pluginsObject.localPath);
        } catch (error) {
          if (!isModuleNotFoundError(error, name)) throw error;

          // Plugin not installed
          if (this.cliOptions.help || this.cliCommands[0] === 'plugin') {
            // User may intend to install plugins just listed in serverless config
            // Therefore skip on MODULE_NOT_FOUND case
            return null;
          }

          throw new this.serverless.classes.Error(
            [
              `Serverless plugin "${name}" not found.`,
              ' Make sure it\'s installed and listed in the "plugins" section',
              ' of your serverless config file.',
            ].join('')
          );
        }
        if (!Plugin) {
          throw new this.serverless.classes.Error(
            `Serverless plugin "${name}", didn't export Plugin constructor.`
          );
        }
        return Plugin;
      });
  }

  resolveEnterprisePlugin() {
    if (config.getGlobalConfig().enterpriseDisabled) return null;
    return require('@serverless/enterprise-plugin');
  }

  parsePluginsObject(servicePlugs) {
    let localPath =
      this.serverless &&
      this.serverless.config &&
      this.serverless.config.servicePath &&
      path.join(this.serverless.config.servicePath, '.serverless_plugins');
    let modules = [];

    if (_.isArray(servicePlugs)) {
      modules = servicePlugs;
    } else if (servicePlugs) {
      localPath =
        servicePlugs.localPath && _.isString(servicePlugs.localPath)
          ? servicePlugs.localPath
          : localPath;
      if (_.isArray(servicePlugs.modules)) {
        modules = servicePlugs.modules;
      }
    }

    return { modules, localPath };
  }

  createCommandAlias(alias, command) {
    // Deny self overrides
    if (_.startsWith(command, alias)) {
      throw new this.serverless.classes.Error(`Command "${alias}" cannot be overriden by an alias`);
    }

    const splitAlias = _.split(alias, ':');
    const aliasTarget = _.reduce(
      splitAlias,
      (__, aliasPath) => {
        const currentAlias = __;
        if (!currentAlias[aliasPath]) {
          currentAlias[aliasPath] = {};
        }
        return currentAlias[aliasPath];
      },
      this.aliases
    );
    // Check if the alias is already defined
    if (aliasTarget.command) {
      throw new this.serverless.classes.Error(
        `Alias "${alias}" is already defined for command ${aliasTarget.command}`
      );
    }
    // Check if the alias would overwrite an exiting command
    if (
      _.reduce(
        splitAlias,
        (__, aliasPath) => {
          if (!__ || !__.commands || !__.commands[aliasPath]) {
            return null;
          }
          return __.commands[aliasPath];
        },
        this
      )
    ) {
      throw new this.serverless.classes.Error(`Command "${alias}" cannot be overriden by an alias`);
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
      throw new this.serverless.classes.Error(`Command "${key}" cannot override an existing alias`);
    }
    // Load the command
    const commands = _.mapValues(details.commands, (subDetails, subKey) =>
      this.loadCommand(pluginName, subDetails, `${key}:${subKey}`, commandIsEntryPoint)
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

  loadVariableResolvers(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    for (const [variablePrefix, resolverOrOptions] of _.entries(
      pluginInstance.variableResolvers || {}
    )) {
      let options = resolverOrOptions;
      if (!options) {
        this.serverless.cli.log(
          `Warning! Ignoring falsey variableResolver for ${variablePrefix} in ${pluginName}.`
        );
        continue;
      }
      if (_.isFunction(resolverOrOptions)) {
        options = {
          resolver: resolverOrOptions,
        };
      }
      if (!_.isObject(options)) {
        throw new Error(
          `Custom variable resolver {${variablePrefix}: ${JSON.stringify(
            options
          )}} defined by ${pluginName} isn't an object`
        );
      } else if (!variablePrefix.match(/[0-9a-zA-Z_-]+/)) {
        throw new Error(
          `Custom variable resolver prefix ${variablePrefix} defined by ${pluginName} may only contain alphanumeric characters, hyphens or underscores.`
        );
      }
      if (!_.isFunction(options.resolver)) {
        throw new Error(
          `Custom variable resolver for ${variablePrefix} defined by ${pluginName} specifies a resolver that isn't a function: ${options.resolver}`
        );
      }
      if (options.isDisabledAtPrepopulation && typeof options.serviceName !== 'string') {
        throw new Error(
          `Custom variable resolver for ${variablePrefix} defined by ${pluginName} specifies isDisabledAtPrepopulation but doesn't provide a string for a name`
        );
      }
      this.serverless.variables.variableResolvers.push({
        regex: new RegExp(`^${variablePrefix}:`),
        resolver: options.resolver.bind(this.serverless.variables),
        isDisabledAtPrepopulation: options.isDisabledAtPrepopulation || false,
        serviceName: options.serviceName || null,
      });
    }
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

    return _.reduce(
      commandOrAlias,
      (current, name, index) => {
        const commandExists = name in current.commands;
        const isNotContainer = commandExists && current.commands[name].type !== 'container';
        const isNotEntrypoint = commandExists && current.commands[name].type !== 'entrypoint';
        const remainingIterationsLeft = index < commandOrAlias.length - 1;

        if (
          commandExists &&
          (isNotContainer || remainingIterationsLeft) &&
          (isNotEntrypoint || allowEntryPoints)
        ) {
          return current.commands[name];
        }
        // if user is using a top level command properly, but sub commands are not
        if (this.serverless.cli.loadedCommands[commandOrAlias[0]]) {
          const errorMessage = [`"${name}" is not a valid sub command. Run "serverless `];
          for (let i = 0; commandOrAlias[i] !== name; i++) {
            errorMessage.push(`${commandOrAlias[i]}`);
            if (commandOrAlias[i + 1] !== name) {
              errorMessage.push(' ');
            }
          }
          errorMessage.push('" to see a more helpful error message for this command.');
          throw new this.serverless.classes.Error(errorMessage.join(''));
        }

        // top level command isn't valid. give a suggestion
        const commandName = commandOrAlias.slice(0, index + 1).join(' ');
        const suggestedCommand = getCommandSuggestion(
          commandName,
          this.serverless.cli.loadedCommands
        );
        const errorMessage = [
          `Serverless command "${commandName}" not found. Did you mean "${suggestedCommand}"?`,
          ' Run "serverless help" for a list of all available commands.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      },
      { commands: this.commands }
    );
  }

  getEvents(command) {
    return _.flatMap(command.lifecycleEvents, event => [
      `before:${command.key}:${event}`,
      `${command.key}:${event}`,
      `after:${command.key}:${event}`,
    ]);
  }

  getPlugins() {
    return this.plugins;
  }

  getHooks(events) {
    return _.flatMap([].concat(events), event => this.hooks[event] || []);
  }

  invoke(commandsArray, allowEntryPoints) {
    const command = this.getCommand(commandsArray, allowEntryPoints);

    this.convertShortcutsIntoOptions(command);
    this.validateServerlessConfigDependency(command);
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

    return BbPromise.reduce(hooks, (__, hook) => hook.hook(), null).catch(
      TerminateHookChain,
      () => {
        if (process.env.SLS_DEBUG) {
          this.serverless.cli.log(`Terminate ${_.join(commandsArray, ':')}`);
        }
        return BbPromise.resolve();
      }
    );
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
    return this.invoke(commands, true).then(() => {
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
    // first initialize hooks
    return this.getHooks(['initialize'])
      .reduce((chain, { hook }) => chain.then(hook), BbPromise.resolve())
      .then(() => this.invoke(commandsArray));
  }

  /**
   * Check if the command is valid. Internally this function will only find
   * CLI accessible commands (command.type !== 'entrypoint')
   */
  validateCommand(commandsArray) {
    this.getCommand(commandsArray);
  }

  /**
   * If the command has no use when operated in a working directory with no serverless
   * configuration file, throw an error
   */
  validateServerlessConfigDependency(command) {
    if ('configDependent' in command && command.configDependent) {
      if (!this.serverlessConfigFile) {
        const msg = [
          'This command can only be run in a Serverless service directory. ',
          "Make sure to reference a valid config file in the current working directory if you're using a custom config file",
        ].join('');
        throw new this.serverless.classes.Error(msg);
      }
    }
  }

  validateOptions(command) {
    _.forEach(command.options, (value, key) => {
      if (value.required && (this.cliOptions[key] === true || !this.cliOptions[key])) {
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

      if (
        _.isPlainObject(value.customValidation) &&
        value.customValidation.regularExpression instanceof RegExp &&
        _.isString(value.customValidation.errorMessage) &&
        !value.customValidation.regularExpression.test(this.cliOptions[key])
      ) {
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

    const serverlessConfigFileHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(this.serverlessConfigFile))
      .digest('hex');
    cacheFile.validationHash = serverlessConfigFileHash;
    const cacheFilePath = getCacheFilePath(this.serverless.config.servicePath);

    return writeFile(cacheFilePath, cacheFile);
  }

  convertShortcutsIntoOptions(command) {
    _.forEach(command.options, (optionObject, optionKey) => {
      if (
        optionObject.shortcut &&
        _.includes(Object.keys(this.cliOptions), optionObject.shortcut)
      ) {
        Object.keys(this.cliOptions).forEach(option => {
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

  asyncPluginInit() {
    return BbPromise.all(this.plugins.map(plugin => plugin.asyncInit && plugin.asyncInit()));
  }
}

module.exports = PluginManager;
