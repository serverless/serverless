'use strict';

const path = require('path');
const config = require('@serverless/utils/config');
const _ = require('lodash');
const ServerlessError = require('../serverless-error');
const resolveCliInput = require('../cli/resolve-input');
const renderCommandHelp = require('../cli/render-help/command');
const processBackendNotificationRequest = require('../utils/process-backend-notification-request');
const tokenizeException = require('../utils/tokenize-exception');
const getRequire = require('../utils/get-require');
const { log, getPluginWriters } = require('@serverless/utils/log');

const mergeCommands = (target, source) => {
  if (!target) return source;
  for (const key of Object.keys(source)) {
    if (target[key] == null) {
      target[key] = source[key];
      continue;
    }
    switch (key) {
      case 'options':
        for (const [name, value] of Object.entries(source.options)) {
          if (!target.options[name]) target.options[name] = value;
        }
        break;
      case 'commands':
        for (const [name, value] of Object.entries(source.commands)) {
          target.commands[name] = mergeCommands(target.commands[name], value);
        }
        break;
      case 'lifecycleEvents':
        if (source[key].length) target[key] = source[key];
        break;
      default:
    }
  }
  return target;
};

/**
 * @private
 * Error type to terminate the currently running hook chain successfully without
 * executing the rest of the current command's lifecycle chain.
 */
class TerminateHookChain extends Error {
  constructor(commands) {
    const commandChain = commands.join(':');
    const message = `Terminating ${commandChain}`;
    super(message);
    this.message = message;
    this.name = 'TerminateHookChain';
  }
}

let isRegisteringExternalPlugins = false;

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;

    this.cliOptions = {};
    this.cliCommands = [];
    this.pluginIndependentCommands = new Set(['help', 'plugin']);

    this.plugins = [];
    this.externalPlugins = new Set();
    this.localPluginsPaths = [];
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
    const pluginUtils = {};
    if (Plugin._serverlessExternalPluginName) {
      Object.assign(pluginUtils, getPluginWriters(Plugin._serverlessExternalPluginName));
    }
    const pluginInstance = new Plugin(this.serverless, this.cliOptions, pluginUtils);
    if (isRegisteringExternalPlugins) {
      this.externalPlugins.add(pluginInstance);
    }

    let pluginProvider = null;
    // check if plugin is provider agnostic
    if (pluginInstance.provider) {
      if (typeof pluginInstance.provider === 'string') {
        pluginProvider = pluginInstance.provider;
      } else if (_.isObject(pluginInstance.provider)) {
        pluginProvider = pluginInstance.provider.constructor.getProviderName();
      }
    }

    // ignore plugins that specify a different provider than the current one
    if (pluginProvider && pluginProvider !== this.serverless.service.provider.name) {
      return null;
    }

    // don't load plugins twice
    if (this.plugins.some((plugin) => plugin instanceof Plugin)) {
      throw new ServerlessError(
        'Encountered duplicate plugin definition. Please remove duplicate plugins from your configuration.',
        'DUPLICATE_PLUGIN_DEFINITION'
      );
    }

    this.loadCommands(pluginInstance);
    this.loadHooks(pluginInstance);

    this.plugins.push(pluginInstance);

    return pluginInstance;
  }

  loadAllPlugins(servicePlugins) {
    const EnterprisePlugin = this.resolveEnterprisePlugin();

    isRegisteringExternalPlugins = false;
    require('../plugins')
      .filter(Boolean)
      .forEach((Plugin) => this.addPlugin(Plugin));

    isRegisteringExternalPlugins = true;
    this.resolveServicePlugins(servicePlugins)
      .filter(Boolean)
      .forEach((Plugin) => this.addPlugin(Plugin));
    isRegisteringExternalPlugins = false;
    if (EnterprisePlugin) this.dashboardPlugin = this.addPlugin(EnterprisePlugin);
    isRegisteringExternalPlugins = true;
    return this.asyncPluginInit();
  }

  requireServicePlugin(serviceDir, pluginPath, legacyLocalPluginsPath) {
    if (legacyLocalPluginsPath && !pluginPath.startsWith('./')) {
      // TODO (BREAKING): Consider removing support for localPluginsPath with next major
      const absolutePluginPath = path.resolve(legacyLocalPluginsPath, pluginPath);

      const isLocatedAtLegacyPluginsPath = (() => {
        try {
          require.resolve(absolutePluginPath);
          return true;
        } catch {
          return false;
        }
      })();
      if (isLocatedAtLegacyPluginsPath) return require(absolutePluginPath);
    }
    const serviceDirRequire = getRequire(serviceDir);
    const entryFilePath = (() => {
      try {
        return serviceDirRequire.resolve(pluginPath);
      } catch {
        return null;
      }
    })();
    if (entryFilePath) {
      if (pluginPath.startsWith('./')) {
        this.localPluginsPaths.push({ resolvedPath: entryFilePath, inputPath: pluginPath });
      }
      return require(entryFilePath);
    }

    // Search in "node_modules" in which framework is placed
    try {
      require.resolve(pluginPath);
    } catch {
      throw Object.assign(new Error('Plugin not found'), { code: 'PLUGIN_NOT_FOUND' });
    }
    return require(pluginPath);
  }

  resolveServicePlugins(servicePlugs) {
    const pluginsObject = this.parsePluginsObject(servicePlugs);
    const serviceDir = this.serverless.serviceDir;
    return (
      pluginsObject.modules
        // Initially @serverless/enterprise-plugin was published as external plugin
        // We ensure to not load it, if for some reason it's still in service configuration
        .filter((name) => name !== '@serverless/enterprise-plugin')
        .map((name) => {
          let Plugin;
          try {
            Plugin = this.requireServicePlugin(serviceDir, name, pluginsObject.localPath);
          } catch (error) {
            if (error.code !== 'PLUGIN_NOT_FOUND') throw error;

            // Plugin not installed
            if (
              resolveCliInput().isHelpRequest ||
              this.pluginIndependentCommands.has(this.cliCommands[0])
            ) {
              // User may intend to install plugins just listed in serverless config
              // Therefore skip on MODULE_NOT_FOUND case
              return null;
            }

            const isLocalPlugin = name.startsWith('./');

            throw new ServerlessError(
              [
                `Serverless plugin "${name}" not found.`,
                ' Make sure it\'s installed and listed in the "plugins" section',
                ' of your serverless config file.',
                isLocalPlugin ? '' : ` Run "serverless plugin install -n ${name}" to install it.`,
              ].join(''),
              'PLUGIN_NOT_FOUND'
            );
          }
          if (!Plugin) {
            throw new ServerlessError(
              `Serverless plugin "${name}", didn't export Plugin constructor.`,
              'MISSING_PLUGIN_NAME'
            );
          }
          Object.defineProperty(Plugin, '_serverlessExternalPluginName', {
            value: name,
            configurable: true,
            writable: true,
          });
          return Plugin;
        })
    );
  }

  getLocalPluginsPathPatterns() {
    return this.localPluginsPaths
      .map(({ resolvedPath, inputPath }) => {
        const absoluteInputPath = path.resolve(this.serverless.serviceDir, inputPath);
        if (
          absoluteInputPath === resolvedPath ||
          absoluteInputPath + path.extname(resolvedPath) === resolvedPath
        ) {
          return path.relative(this.serverless.serviceDir, resolvedPath);
        }

        if (resolvedPath.startsWith(absoluteInputPath + path.sep)) {
          return path.relative(
            this.serverless.serviceDir,
            path.join(path.dirname(resolvedPath), '/**')
          );
        }

        return null;
      })
      .filter((v) => v !== null);
  }

  resolveEnterprisePlugin() {
    if (config.getConfig().enterpriseDisabled) return null;
    this.pluginIndependentCommands.add('login').add('logout').add('dashboard');
    return require('@serverless/dashboard-plugin');
  }

  parsePluginsObject(servicePlugs) {
    let localPath =
      this.serverless &&
      this.serverless.serviceDir &&
      path.join(this.serverless.serviceDir, '.serverless_plugins');
    let modules = [];

    if (Array.isArray(servicePlugs)) {
      modules = servicePlugs;
    } else if (servicePlugs) {
      localPath =
        servicePlugs.localPath && typeof servicePlugs.localPath === 'string'
          ? servicePlugs.localPath
          : localPath;
      if (Array.isArray(servicePlugs.modules)) {
        modules = servicePlugs.modules;
      }
    }

    return { modules, localPath };
  }

  createCommandAlias(alias, command) {
    // Deny self overrides
    if (command.startsWith(alias)) {
      throw new ServerlessError(
        `Command "${alias}" cannot be overriden by an alias`,
        'INVALID_COMMAND_ALIAS'
      );
    }

    const splitAlias = alias.split(':');
    const aliasTarget = splitAlias.reduce((__, aliasPath) => {
      const currentAlias = __;
      if (!currentAlias[aliasPath]) {
        currentAlias[aliasPath] = {};
      }
      return currentAlias[aliasPath];
    }, this.aliases);
    // Check if the alias is already defined
    if (aliasTarget.command) {
      throw new ServerlessError(
        `Alias "${alias}" is already defined for command ${aliasTarget.command}`,
        'COMMAND_ALIAS_ALREADY_DEFINED'
      );
    }
    // Check if the alias would overwrite an exiting command
    if (
      splitAlias.reduce((__, aliasPath) => {
        if (!__ || !__.commands || !__.commands[aliasPath]) {
          return null;
        }
        return __.commands[aliasPath];
      }, this)
    ) {
      throw new ServerlessError(
        `Command "${alias}" cannot be overriden by an alias`,
        'INVALID_COMMAND_ALIAS'
      );
    }
    aliasTarget.command = command;
  }

  loadCommand(pluginName, details, key, isEntryPoint) {
    const commandIsEntryPoint = details.type === 'entrypoint' || isEntryPoint;
    log.get('lifecycle:command:register').debug(key);
    // Check if there is already an alias for the same path as the command
    const aliasCommand = this.getAliasCommandTarget(key.split(':'));
    if (aliasCommand) {
      throw new ServerlessError(
        `Command "${key}" cannot override an existing alias`,
        'INVALID_COMMAND_OVERRIDE_EXISTING_ALIAS'
      );
    }
    // Load the command
    const commands = _.mapValues(details.commands, (subDetails, subKey) =>
      this.loadCommand(pluginName, subDetails, `${key}:${subKey}`, commandIsEntryPoint)
    );
    // Handle command aliases
    (details.aliases || []).forEach((alias) => {
      log.get('lifecycle:command:register').debug(`  -> @${alias}`);
      this.createCommandAlias(alias, key);
    });
    return Object.assign({}, details, { key, pluginName, commands });
  }

  loadCommands(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    if (pluginInstance.commands) {
      Object.entries(pluginInstance.commands).forEach(([key, details]) => {
        const command = this.loadCommand(pluginName, details, key);
        if (!command.lifecycleEvents) command.lifecycleEvents = [];
        this.commands[key] = mergeCommands(
          this.commands[key],
          _.merge({}, command, {
            isExternal: isRegisteringExternalPlugins,
          })
        );
      });
    }
  }

  loadHooks(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    if (pluginInstance.hooks) {
      Object.entries(pluginInstance.hooks).forEach(([event, hook]) => {
        let target = event;
        const baseEvent = event.replace(/^(?:after:|before:)/, '');
        if (this.deprecatedEvents[baseEvent]) {
          const redirectedEvent = this.deprecatedEvents[baseEvent];
          log.info(
            `Plugin "${pluginName}" uses deprecated hook "${event}". Use "${redirectedEvent}" hook instead.`
          );
          if (redirectedEvent) {
            target = event.replace(baseEvent, redirectedEvent);
          }
        }
        this.hooks[target] = this.hooks[target] || [];
        this.hooks[target].push({
          pluginName,
          hook,
        });
      });
    }
  }

  getCommands() {
    const result = {};

    // Iterate through the commands and stop at entrypoints to include only public
    // command throughout the hierarchy.
    const stack = [{ commands: this.commands, target: result }];
    while (stack.length) {
      const currentCommands = stack.pop();
      const commands = currentCommands.commands;
      const target = currentCommands.target;
      if (commands) {
        Object.entries(commands).forEach(([name, command]) => {
          if (command.type !== 'entrypoint') {
            target[name] = _.omit(command, 'commands');
            if (
              Object.values(command.commands).some(
                (childCommand) => childCommand.type !== 'entrypoint'
              )
            ) {
              target[name].commands = {};
              stack.push({ commands: command.commands, target: target[name].commands });
            }
          }
        });
      }
    }
    // Iterate through the existing aliases and add them as commands
    _.remove(stack);
    stack.push({ aliases: this.aliases, target: result });
    while (stack.length) {
      const currentAlias = stack.pop();
      const aliases = currentAlias.aliases;
      const target = currentAlias.target;
      if (aliases) {
        Object.entries(aliases).forEach(([name, alias]) => {
          if (name === 'command') {
            return;
          }
          if (alias.command) {
            const commandPath = alias.command.split(':').join('.commands.');
            target[name] = _.get(this.commands, commandPath);
          } else {
            target[name] = target[name] || {};
            target[name].commands = target[name].commands || {};
          }
          stack.push({ aliases: alias, target: target[name].commands });
        });
      }
    }
    return result;
  }

  getAliasCommandTarget(aliasArray) {
    // Check if the command references an alias
    const aliasCommand = aliasArray.reduce((__, commandPath) => {
      if (!__ || !__[commandPath]) {
        return null;
      }
      return __[commandPath];
    }, this.aliases);

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
    const commandOrAlias = aliasCommandTarget ? aliasCommandTarget.split(':') : commandsArray;

    return commandOrAlias.reduce(
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

        if (!isNotContainer && isNotEntrypoint) return current.commands[name];

        // Invalid command, can happen only when Framework is used programmatically,
        // as otherwise command is validated in main script
        throw new new ServerlessError(
          `Unrecognized command "${commandsArray.join(' ')}"`,
          'UNRECOGNIZED COMMAND'
        )();
      },
      { commands: this.commands }
    );
  }

  getPlugins() {
    return this.plugins;
  }

  getLifecycleEventsData(command) {
    const lifecycleEventsData = [];
    let hooksLength = 0;
    for (const lifecycleEventSubName of command.lifecycleEvents || []) {
      const lifecycleEventName = `${command.key}:${lifecycleEventSubName}`;
      const hooksData = {
        before: this.hooks[`before:${lifecycleEventName}`] || [],
        at: this.hooks[lifecycleEventName] || [],
        after: this.hooks[`after:${lifecycleEventName}`] || [],
      };
      hooksLength += hooksData.before.length + hooksData.at.length + hooksData.after.length;
      lifecycleEventsData.push({
        command,
        lifecycleEventSubName,
        lifecycleEventName,
        hooksData,
      });
    }
    return { lifecycleEventsData, hooksLength };
  }

  async runHooks(hookName, hooks) {
    for (const { hook } of hooks) await hook();
  }

  async invoke(commandsArray, allowEntryPoints) {
    const command = this.getCommand(commandsArray, allowEntryPoints);
    if (command.type === 'container') {
      renderCommandHelp(commandsArray.join(' '));
      return;
    }

    this.convertShortcutsIntoOptions(command);
    this.validateServerlessConfigDependency(command);
    this.assignDefaultOptions(command);

    const { lifecycleEventsData, hooksLength } = this.getLifecycleEventsData(command);

    log
      .get('lifecycle:command:invoke')
      .debug(
        `Invoke ${commandsArray.join(':')}${
          !hooksLength ? ' (noop due to no registered hooks)' : ''
        }`
      );

    try {
      for (const {
        lifecycleEventName,
        hooksData: { before, at, after },
      } of lifecycleEventsData) {
        await this.runHooks(`before:${lifecycleEventName}`, before);
        await this.runHooks(lifecycleEventName, at);
        await this.runHooks(`after:${lifecycleEventName}`, after);
      }
    } catch (error) {
      if (error instanceof TerminateHookChain) {
        log.debug(`Terminate ${commandsArray.join(':')}`);
        return;
      }
      throw error;
    }
  }

  /**
   * Invokes the given command and starts the command's lifecycle.
   * This method can be called by plugins directly to spawn a separate sub lifecycle.
   */
  async spawn(commandsArray, options) {
    let commands = commandsArray;
    if (typeof commandsArray === 'string') {
      commands = commandsArray.split(':');
    }
    await this.invoke(commands, true);
    if (_.get(options, 'terminateLifecycleAfterExecution', false)) {
      throw new TerminateHookChain(commands);
    }
  }

  /**
   * Called by the CLI to start a public command.
   */
  async run(commandsArray) {
    this.commandRunStartTime = Date.now();
    if (resolveCliInput().commands[0] !== 'plugin') {
      // first initialize hooks
      for (const { hook } of this.hooks.initialize || []) await hook();
    }

    let deferredBackendNotificationRequest;

    try {
      await this.invoke(commandsArray);
    } catch (commandException) {
      try {
        for (const { hook } of this.hooks.error || []) await hook(commandException);
      } catch (errorHookException) {
        const errorHookExceptionMeta = tokenizeException(errorHookException);
        log.warning(
          `The "error" hook crashed with:\n${
            errorHookExceptionMeta.stack || errorHookExceptionMeta.message
          }`
        );
      } finally {
        await deferredBackendNotificationRequest;
        throw commandException; // eslint-disable-line no-unsafe-finally
      }
    }

    try {
      for (const { hook } of this.hooks.finalize || []) await hook();
    } catch (finalizeHookException) {
      await deferredBackendNotificationRequest;
      throw finalizeHookException;
    }

    if (deferredBackendNotificationRequest) {
      await processBackendNotificationRequest(await deferredBackendNotificationRequest);
    }
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
    if (command.configDependent || command.serviceDependencyMode === 'required') {
      if (!this.serverless.configurationInput) {
        const msg = [
          'This command can only be run in a Serverless service directory. ',
          "Make sure to reference a valid config file in the current working directory if you're using a custom config file",
        ].join('');
        throw new ServerlessError(msg, 'INVALID_COMMAND_MISSING_SERVICE_DIRECTORY');
      }
    }
  }

  convertShortcutsIntoOptions(command) {
    if (command.options) {
      Object.entries(command.options).forEach(([optionKey, optionObject]) => {
        if (optionObject.shortcut && Object.keys(this.cliOptions).includes(optionObject.shortcut)) {
          Object.keys(this.cliOptions).forEach((option) => {
            if (option === optionObject.shortcut) {
              this.cliOptions[optionKey] = this.cliOptions[option];
            }
          });
        }
      });
    }
  }

  assignDefaultOptions(command) {
    if (command.options) {
      Object.entries(command.options).forEach(([key, value]) => {
        if (value.default != null && (!this.cliOptions[key] || this.cliOptions[key] === true)) {
          this.cliOptions[key] = value.default;
        }
      });
    }
  }

  async asyncPluginInit() {
    return Promise.all(this.plugins.map((plugin) => plugin.asyncInit && plugin.asyncInit()));
  }
}

module.exports = PluginManager;
