'use strict';

const path = require('path');
const config = require('@serverless/utils/config');
const cjsResolve = require('ncjsm/resolve/sync');
const _ = require('lodash');
const crypto = require('crypto');
const isModuleNotFoundError = require('ncjsm/is-module-not-found-error');
const ServerlessError = require('../serverless-error');
const resolveCliInput = require('../cli/resolve-input');
const writeFile = require('../utils/fs/writeFile');
const getCacheFilePath = require('../utils/getCacheFilePath');
const getCommandSuggestion = require('../utils/getCommandSuggestion');
const renderCommandHelp = require('../cli/render-help/command');
const { storeLocally: storeTelemetryLocally, send: sendTelemetry } = require('../utils/telemetry');
const generateTelemetryPayload = require('../utils/telemetry/generatePayload');
const processBackendNotificationRequest = require('../utils/processBackendNotificationRequest');
const isTelemetryDisabled = require('../utils/telemetry/areDisabled');
const tokenizeException = require('../utils/tokenize-exception');

const requireServicePlugin = (serviceDir, pluginPath, localPluginsPath) => {
  if (localPluginsPath && !pluginPath.startsWith('./')) {
    // TODO (BREAKING): Consider removing support for localPluginsPath with next major
    const absoluteLocalPluginPath = path.resolve(localPluginsPath, pluginPath);

    try {
      return require(absoluteLocalPluginPath);
    } catch (error) {
      if (!isModuleNotFoundError(error, absoluteLocalPluginPath)) throw error;
    }
  }
  try {
    return require(cjsResolve(serviceDir, pluginPath).realPath);
  } catch (error) {
    if (!isModuleNotFoundError(error, pluginPath) || pluginPath.startsWith('.')) {
      throw error;
    }
  }

  // Search in "node_modules" in which framework is placed
  return require(cjsResolve(__dirname, pluginPath).realPath);
};

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
      this.serverless.cli.log(`WARNING: duplicate plugin ${Plugin.name} was not loaded\n`);
      return null;
    }

    this.loadCommands(pluginInstance);
    this.loadHooks(pluginInstance);
    this.loadVariableResolvers(pluginInstance);

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
            Plugin = requireServicePlugin(serviceDir, name, pluginsObject.localPath);
          } catch (error) {
            if (!isModuleNotFoundError(error, name)) throw error;

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
          return Plugin;
        })
    );
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
    if (process.env.SLS_DEBUG && !commandIsEntryPoint) {
      this.serverless.cli.log(`Load command ${key}`);
    }
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
      if (process.env.SLS_DEBUG) {
        this.serverless.cli.log(`  -> @${alias}`);
      }
      this.createCommandAlias(alias, key);
    });
    return Object.assign({}, details, { key, pluginName, commands });
  }

  loadCommands(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    if (pluginInstance.commands) {
      Object.entries(pluginInstance.commands).forEach(([key, details]) => {
        const command = this.loadCommand(pluginName, details, key);
        // Grab and extract deprecated events
        command.lifecycleEvents = (command.lifecycleEvents || []).map((event) => {
          if (event.startsWith('deprecated#')) {
            // Extract event and optional redirect
            const transformedEvent = /^deprecated#(.*?)(?:->(.*?))?$/.exec(event);
            this.deprecatedEvents[`${command.key}:${transformedEvent[1]}`] =
              transformedEvent[2] || null;
            return transformedEvent[1];
          }
          return event;
        });
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
          if (process.env.SLS_DEBUG) {
            this.serverless.cli.log(`WARNING: Plugin ${pluginName} uses deprecated hook ${event},
                     use ${redirectedEvent} hook instead`);
          }
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

  loadVariableResolvers(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    for (const [variablePrefix, resolverOrOptions] of Object.entries(
      pluginInstance.variableResolvers || {}
    )) {
      let options = resolverOrOptions;
      if (!options) {
        this.serverless.cli.log(
          `Warning! Ignoring falsy variableResolver for ${variablePrefix} in ${pluginName}.`
        );
        continue;
      }
      if (typeof resolverOrOptions === 'function') {
        options = {
          resolver: resolverOrOptions,
        };
      }
      if (!_.isObject(options)) {
        throw new ServerlessError(
          `Custom variable resolver {${variablePrefix}: ${JSON.stringify(
            options
          )}} defined by ${pluginName} isn't an object`,
          'CUSTOM_LEGACY_VARIABLES_RESOLVER_INVALID_FORMAT'
        );
      } else if (!variablePrefix.match(/[0-9a-zA-Z_-]+/)) {
        throw new ServerlessError(
          `Custom variable resolver prefix ${variablePrefix} defined by ${pluginName} ` +
            'may only contain alphanumeric characters, hyphens or underscores.',
          'CUSTOM_LEGACY_VARIABLES_RESOLVER_INVALID_PREFIX'
        );
      }
      if (typeof options.resolver !== 'function') {
        throw new ServerlessError(
          `Custom variable resolver for ${variablePrefix} defined by ${pluginName} ` +
            `specifies a resolver that isn't a function: ${options.resolver}`,
          'CUSTOM_LEGACY_VARIABLES_RESOLVER_INVALID_FORMAT'
        );
      }
      if (options.isDisabledAtPrepopulation && typeof options.serviceName !== 'string') {
        throw new ServerlessError(
          `Custom variable resolver for ${variablePrefix} defined by ${pluginName} ` +
            "specifies isDisabledAtPrepopulation but doesn't provide a string for a name",
          'CUSTOM_LEGACY_VARIABLES_RESOLVER_INVALID_CONFIGURATION'
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
          throw new ServerlessError(errorMessage.join(''), 'SUBCOMMAND_NOT_FOUND');
        }

        // top level command isn't valid. give a suggestion
        const commandName = commandOrAlias.slice(0, index + 1).join(' ');
        const suggestedCommand = getCommandSuggestion(
          commandName,
          this.serverless.cli.loadedCommands
        );
        // TODO: Remove with next major (functionality is replicated in main script)
        const errorMessage = [
          `Serverless command "${commandName}" not found. Did you mean "${suggestedCommand}"?`,
          ' Run "serverless help" for a list of all available commands.',
        ].join('');
        throw new ServerlessError(errorMessage, 'COMMAND_NOT_FOUND');
      },
      { commands: this.commands }
    );
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

  async invoke(commandsArray, allowEntryPoints) {
    const command = this.getCommand(commandsArray, allowEntryPoints);
    if (command.type === 'container') {
      renderCommandHelp(commandsArray.join(' '));
      return;
    }

    this.convertShortcutsIntoOptions(command);
    this.validateServerlessConfigDependency(command);
    this.assignDefaultOptions(command);
    this.validateOptions(command);

    const events = this.getEvents(command);
    const hooks = this.getHooks(events);

    if (process.env.SLS_DEBUG) {
      this.serverless.cli.log(`Invoke ${commandsArray.join(':')}`);
      if (hooks.length === 0) {
        const warningMessage = 'Warning: The command you entered did not catch on any hooks';
        this.serverless.cli.log(warningMessage);
      }
    }

    for (const hook of hooks) {
      try {
        await hook.hook();
      } catch (error) {
        if (error instanceof TerminateHookChain) {
          if (process.env.SLS_DEBUG) {
            this.serverless.cli.log(`Terminate ${commandsArray.join(':')}`);
          }
          return;
        }
        throw error;
      }
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
    if (resolveCliInput().commands[0] !== 'plugin') {
      // first initialize hooks
      for (const { hook } of this.getHooks(['initialize'])) {
        await hook();
      }
    }

    let deferredBackendNotificationRequest;

    // TODO: Remove this logic with `v3.0.0` along with removal of `isTelemetryReportedExternally`
    // After we are ensured that local fallback from `v3` will always fall back to `v3` local installation
    if (!this.serverless.isTelemetryReportedExternally && !isTelemetryDisabled) {
      storeTelemetryLocally(
        generateTelemetryPayload({
          ...resolveCliInput(),
          serviceDir: this.serverless.serviceDir,
          configuration: this.serverless.configurationInput,
          serverless: this.serverless,
        })
      );
      if (commandsArray.join(' ') === 'deploy') {
        deferredBackendNotificationRequest = sendTelemetry({
          serverlessExecutionSpan: this.serverless.onExitPromise,
        });
      }
    }

    try {
      await this.invoke(commandsArray);
    } catch (error) {
      try {
        for (const { hook } of this.getHooks(['error'])) await hook(error);
      } catch (subError) {
        const subErrorMeta = tokenizeException(subError);
        this.serverless.cli.log(
          `Warning: "error" hook crashed with: ${subErrorMeta.stack || subErrorMeta.message}`
        );
      } finally {
        throw error; // eslint-disable-line no-unsafe-finally
      }
    } finally {
      if (deferredBackendNotificationRequest) {
        await processBackendNotificationRequest(await deferredBackendNotificationRequest);
      }
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

  validateOptions(command) {
    // TODO: Remove with next major, as it's already handled externally
    if (command.options) {
      Object.entries(command.options).forEach(([key, value]) => {
        if (value.required && (this.cliOptions[key] === true || !this.cliOptions[key])) {
          let requiredThings = `the --${key} option`;

          if (value.shortcut) {
            requiredThings += ` / -${value.shortcut} shortcut`;
          }
          let errorMessage = `This command requires ${requiredThings}.`;

          if (value.usage) {
            errorMessage = `${errorMessage} Usage: ${value.usage}`;
          }

          throw new ServerlessError(errorMessage, 'MISSING_REQUIRED_CLI_OPTION');
        }

        if (
          _.isPlainObject(value.customValidation) &&
          value.customValidation.regularExpression instanceof RegExp &&
          typeof value.customValidation.errorMessage === 'string' &&
          !value.customValidation.regularExpression.test(this.cliOptions[key])
        ) {
          throw new ServerlessError(value.customValidation.errorMessage, 'INVALID_CLI_OPTION');
        }
      });
    }
  }

  updateAutocompleteCacheFile() {
    const commands = _.clone(this.getCommands());
    const cacheFile = {
      commands: {},
      validationHash: '',
    };

    Object.entries(commands).forEach(([commandName, commandObj]) => {
      const command = commandObj;
      if (!command.options) {
        command.options = {};
      }
      if (!command.commands) {
        command.commands = {};
      }
      cacheFile.commands[commandName] = Object.keys(command.options)
        .map((option) => `--${option}`)
        .concat(Object.keys(command.commands));
    });

    const serverlessConfigFileHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(this.serverless.configurationInput || null))
      .digest('hex');
    cacheFile.validationHash = serverlessConfigFileHash;
    const cacheFilePath = getCacheFilePath(this.serverless.serviceDir);

    return writeFile(cacheFilePath, cacheFile);
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
