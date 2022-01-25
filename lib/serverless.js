'use strict';

const path = require('path');
const os = require('os');
const ensureString = require('type/string/ensure');
const ensureValue = require('type/value/ensure');
const ensureArray = require('type/array/ensure');
const ensureIterable = require('type/iterable/ensure');
const isPlainObject = require('type/plain-object/is');
const ensurePlainObject = require('type/plain-object/ensure');
const CLI = require('./classes/cli');
const Config = require('./classes/config');
const YamlParser = require('./classes/yaml-parser');
const PluginManager = require('./classes/plugin-manager');
const Utils = require('./classes/utils');
const Service = require('./classes/service');
const ConfigSchemaHandler = require('./classes/config-schema-handler');
const ServerlessError = require('./serverless-error');
const version = require('./../package.json').version;
const isStandaloneExecutable = require('./utils/is-standalone-executable');
const logDeprecation = require('./utils/log-deprecation');
const eventuallyUpdate = require('./utils/eventually-update');
const commmandsSchema = require('./cli/commands-schema');
const resolveCliInput = require('./cli/resolve-input');

// Old local fallback is triggered in older versions by Serverless constructor directly
const isStackFromOldLocalFallback = RegExp.prototype.test.bind(
  /lib[\\/]Serverless.js:\d+[^]+lib[\\/]Serverless.js:\d+/i
);

class Serverless {
  constructor(config = {}) {
    if (!isPlainObject(config)) config = {};

    if (isStackFromOldLocalFallback(new Error().stack)) {
      // Prevent old local fallback, as it's not compatible with this version of the Framework
      const chalk = require('chalk');
      throw new ServerlessError(
        [
          'Cannot run local installation of the Serverless Framework by the outdated global version.',
          'Please upgrade via:',
          '',
          chalk.bold(
            isStandaloneExecutable ? 'serverless upgrade --major' : 'npm install -g serverless'
          ),
          chalk.grey(
            'Note: Latest release can run any version of the locally installed Serverless Framework.'
          ),
          '',
          'Alternatively run locally installed version directly via:',
          '',
          chalk.bold('npx serverless <command> <options>'),
        ].join('\n'),
        'UNSUPPORTED_LOCAL_FALLBACK'
      );
    }

    this.serviceDir = ensureString(config.serviceDir, {
      name: 'options.serviceDir',
      Error: ServerlessError,
      errorCode: 'INVALID_NON_STRING_SERVICE_DIR',
      isOptional: true,
    });
    if (this.serviceDir != null) {
      this.serviceDir = path.resolve(this.serviceDir);
      this.configurationFilename = ensureString(config.configurationFilename, {
        name: 'config.configurationFilename',
        Error: ServerlessError,
        errorCode: 'INVALID_NON_STRING_CONFIGURATION_FILENAME',
      });
      if (path.isAbsolute(this.configurationFilename)) {
        throw new ServerlessError(
          `"config.configurationFilename" cannot be absolute path. Received: ${config.configurationFilename}`,
          'INVALID_ABSOLUTE_PATH_CONFIGURATION_FILENAME'
        );
      }
      this.configurationInput = ensurePlainObject(config.configuration, {
        name: 'config.configuration',
        Error: ServerlessError,
        errorCode: 'INVALID_NON_OBJECT_CONFIGURATION',
      });
    }

    const commands = ensureArray(config.commands);
    // Ensure that original `options` are not mutated, can be removed after addressing:
    // https://github.com/serverless/serverless/issues/2582
    const cliOptions = { ...ensurePlainObject(config.options) };
    this.processedInput = { commands, options: cliOptions };

    this.providers = {};

    this.version = version;

    this.yamlParser = new YamlParser(this);
    this.utils = new Utils(this);
    this.service = new Service(this);

    // Old variables resolver is dropped, yet some plugins access service properties through
    // `variables` class. Below patch ensures those plugins won't get broken
    this.variables = { service: this.service };
    this.pluginManager = new PluginManager(this);
    this.configSchemaHandler = new ConfigSchemaHandler(this);

    this.config = new Config(this, { serviceDir: config.serviceDir });

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Error = ServerlessError;
    this.classes.PluginManager = PluginManager;
    this.classes.ConfigSchemaHandler = ConfigSchemaHandler;

    this.serverlessDirPath = path.join(os.homedir(), '.serverless');
    this.isStandaloneExecutable = isStandaloneExecutable;
    this.triggeredDeprecations = logDeprecation.triggeredDeprecations;

    // TODO: Remove once "@serverless/dashboard-plugin" is integrated into this repository
    this._commandsSchema = commmandsSchema;
  }

  async init() {
    // create an instanceId (can be e.g. used when a predictable random value is needed)
    this.instanceId = new Date().getTime().toString();

    // create a new CLI instance
    this.cli = new this.classes.CLI(this);

    eventuallyUpdate(this);
    // set the options and commands which were processed by the CLI
    this.pluginManager.setCliOptions(this.processedInput.options);
    this.pluginManager.setCliCommands(this.processedInput.commands);

    await this.service.load(this.processedInput.options);
    // load all plugins
    await this.pluginManager.loadAllPlugins(this.service.plugins);
    // give the CLI the plugins and commands so that it can print out
    // information such as options when the user enters --help
    this.cli.setLoadedPlugins(this.pluginManager.getPlugins());
    this.cli.setLoadedCommands(this.pluginManager.getCommands());
  }
  async run() {
    if (this.configurationInput) this.service.reloadServiceFileParam();

    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands);

    // Some plugins acccess `options` through `this.variables`
    this.variables.options = this.pluginManager.cliOptions;

    if (resolveCliInput().commands[0] !== 'plugin') {
      // merge arrays after variables have been populated
      // (https://github.com/serverless/serverless/issues/3511)
      this.service.mergeArrays();

      // populate function names after variables are loaded in case functions were externalized
      // (https://github.com/serverless/serverless/issues/2997)
      this.service.setFunctionNames(this.processedInput.options);

      // If in context of service, validate the service configuration
      if (this.serviceDir) await this.service.validate();
    }

    this.serviceOutputs = new Map();
    this.servicePluginOutputs = new Map();

    // trigger the plugin lifecycle when there's something which should be processed
    await this.pluginManager.run(this.processedInput.commands);
  }

  addServiceOutputSection(sectionName, content) {
    sectionName = ensureString(sectionName, { name: 'sectionName' });
    if (typeof ensureValue(content, { name: 'content' }) !== 'string') {
      content = ensureIterable(content, {
        name: 'content',
        denyEmpty: true,
        ensureItem: ensureString,
      });
    } else if (!content) {
      throw new TypeError('Section content cannot be empty string');
    }
    if (this.serviceOutputs.has(sectionName) || this.servicePluginOutputs.has(sectionName)) {
      throw new TypeError(`Section content for "${sectionName}" was already set`);
    }
    this.servicePluginOutputs.set(sectionName, content);
  }

  setProvider(name, provider) {
    this.providers[name] = provider;
  }

  getProvider(name) {
    return this.providers[name] ? this.providers[name] : false;
  }

  getVersion() {
    return this.version;
  }

  // Only for internal use
  _logDeprecation(code, message) {
    return logDeprecation(code, message, { serviceConfig: this.configurationInput });
  }

  // To be used by external plugins
  logDeprecation(code, message) {
    return this._logDeprecation(`EXT_${ensureString(code)}`, ensureString(message));
  }
}

module.exports = Serverless;
