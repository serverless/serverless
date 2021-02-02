'use strict';

const path = require('path');
const _ = require('lodash');
const os = require('os');
const ensureString = require('type/string/ensure');
const ensurePlainObject = require('type/plain-object/ensure');
const fileExists = require('./utils/fs/fileExists');
const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const Variables = require('./classes/Variables');
const ConfigSchemaHandler = require('./classes/ConfigSchemaHandler');
const ServerlessError = require('./serverless-error');
const version = require('./../package.json').version;
const isStandaloneExecutable = require('./utils/isStandaloneExecutable');
const resolveConfigurationPath = require('./cli/resolve-configuration-path');
const logDeprecation = require('./utils/logDeprecation');
const eventuallyUpdate = require('./utils/eventuallyUpdate');
const resolveLocalServerlessPath = require('./cli/resolve-local-serverless-path');
const isHelpRequest = require('./cli/is-help-request');
const readConfiguration = require('./configuration/read');
const loadEnv = require('./loadEnv');

class Serverless {
  constructor(config) {
    let configObject = config;
    configObject = configObject || {};
    this._isInvokedByGlobalInstallation = Boolean(configObject._isInvokedByGlobalInstallation);
    this.configurationPath = ensureString(configObject.configurationPath, {
      isOptional: true,
      name: 'config.configurationPath',
      Error: ServerlessError,
    });
    if (this.configurationPath) {
      this.configurationPath = path.resolve(this.configurationPath);
      this.configurationInput = ensurePlainObject(configObject.configuration, {
        isOptional: true,
        name: 'config.configuration',
        Error: ServerlessError,
      });
      if (!this.configurationInput && !this._isInvokedByGlobalInstallation) {
        this._logDeprecation(
          'MISSING_SERVICE_CONFIGURATION',
          'Serverless constructor expects resolved service configuration to be provided ' +
            'via "config.configuration".\n' +
            'Starting from next major Serverless will no longer auto resolve it.'
        );
      }
    } else if (configObject.configurationPath === undefined) {
      this._shouldResolveConfigurationInternally = true;
    }
    // Due to design flaw properties of configObject (which is to be merged onto `this.config`)
    // also are subject to variables resolution.
    // To avoid that we clear configObject after consuming it's properties.
    // Once new variables engine is in, we can remove that patch
    delete configObject.configurationPath;
    delete configObject.configuration;
    delete configObject._isInvokedByGlobalInstallation;

    this.providers = {};

    this.version = version;

    this.yamlParser = new YamlParser(this);
    this.utils = new Utils(this);
    this.service = new Service(this);
    this.variables = new Variables(this);
    this.pluginManager = new PluginManager(this);
    this.configSchemaHandler = new ConfigSchemaHandler(this);

    this.cliInputArgv = process.argv.slice(2);
    if (this.configurationPath) {
      // TODO: With a new major release switch resolution to `path.dirname(this.configurationPath)`
      configObject.servicePath = process.cwd();
    }

    this.config = new Config(this, configObject);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Variables = Variables;
    this.classes.Error = ServerlessError;
    this.classes.PluginManager = PluginManager;
    this.classes.ConfigSchemaHandler = ConfigSchemaHandler;

    this.serverlessDirPath = path.join(os.homedir(), '.serverless');
    this.isStandaloneExecutable = isStandaloneExecutable;
    this.isLocallyInstalled = false;
    this.triggeredDeprecations = logDeprecation.triggeredDeprecations;
  }

  async init() {
    if (this._shouldResolveConfigurationInternally) {
      this.configurationPath = await resolveConfigurationPath();
      if (this.configurationPath) {
        this.config.servicePath = process.cwd();
        if (!this._isInvokedByGlobalInstallation) {
          this._logDeprecation(
            'MISSING_SERVICE_CONFIGURATION_PATH',
            'Serverless constructor expects resolved service configuration path to be provided ' +
              'via "config.configurationPath".\n' +
              'Starting from next major Serverless will no longer auto resolve that path internally.'
          );
        }
      }
    }
    if (this.configurationPath && !this.configurationInput) {
      this.configurationInput = await (async () => {
        try {
          return await readConfiguration(this.configurationPath);
        } catch (error) {
          if (isHelpRequest()) return null;
          throw error;
        }
      })();
    }

    // create an instanceId (can be e.g. used when a predictable random value is needed)
    this.instanceId = new Date().getTime().toString();

    // create a new CLI instance
    this.cli = new this.classes.CLI(this, this.cliInputArgv);

    // get an array of commands and options that should be processed
    this.processedInput = this.cli.processInput();

    await this.eventuallyFallbackToLocal();
    if (this.isOverridenByLocal) return;
    eventuallyUpdate(this);
    // set the options and commands which were processed by the CLI
    this.pluginManager.setCliOptions(this.processedInput.options);
    this.pluginManager.setCliCommands(this.processedInput.commands);

    await this.loadEnvVariables();
    await this.service.load(this.processedInput.options);
    // load all plugins
    await this.pluginManager.loadAllPlugins(this.service.plugins);
    // give the CLI the plugins and commands so that it can print out
    // information such as options when the user enters --help
    this.cli.setLoadedPlugins(this.pluginManager.getPlugins());
    this.cli.setLoadedCommands(this.pluginManager.getCommands());
    await this.pluginManager.updateAutocompleteCacheFile();
  }
  async eventuallyFallbackToLocal() {
    if (
      this.configurationInput &&
      this.configurationInput.enableLocalInstallationFallback != null
    ) {
      this._logDeprecation(
        'DISABLE_LOCAL_INSTALLATION_FALLBACK_SETTING',
        'Starting with next major version, "enableLocalInstallationFallback" setting will no longer be supported.' +
          'CLI will unconditionally fallback to service local installation when its found.\n' +
          'Remove this setting to clear this deprecation warning'
      );
    }
    if (this.isLocallyInstalled) return;
    const localServerlessPath = await resolveLocalServerlessPath();
    if (!localServerlessPath) return;
    if (localServerlessPath === __filename) {
      this.isLocallyInstalled = true;
      return;
    }
    if (
      this.configurationInput &&
      this.configurationInput.enableLocalInstallationFallback != null &&
      !this.configurationInput.enableLocalInstallationFallback
    ) {
      return;
    }
    this.cli.log('Running "serverless" installed locally (in service node_modules)');
    // TODO: Replace below fallback logic with more straightforward one at top of the CLI
    // when we willl drop support for the "disableLocalInstallationFallback" setting
    this.isOverridenByLocal = true;
    const ServerlessLocal = require(localServerlessPath);
    const serverlessLocal = new ServerlessLocal({
      configurationPath: this.configurationPath,
      configuration: this.configurationInput,
      _isInvokedByGlobalInstallation: true,
    });
    serverlessLocal.isLocallyInstalled = true;
    // TODO: Remove below assignment with next major
    serverlessLocal.isInvokedByGlobalInstallation = true;
    this.invokedInstance = serverlessLocal;
    await serverlessLocal.init();
  }

  async loadEnvVariables() {
    const configurationInput = this.configurationInput;
    if (this.configurationInput == null) return;

    const stage =
      this.processedInput.options.stage ||
      this.processedInput.options.s ||
      _.get(configurationInput, 'provider.stage', 'dev');

    if (configurationInput.useDotenv) {
      await loadEnv(stage);
    } else {
      const defaultEnvFilePath = path.join(process.cwd(), '.env');
      const stageEnvFilePath = path.join(process.cwd(), `.env.${stage}`);

      const [doesStageEnvFileExists, doesDefaultEnvFileExists] = await Promise.all([
        fileExists(stageEnvFilePath),
        fileExists(defaultEnvFilePath),
      ]);

      if (doesDefaultEnvFileExists || doesStageEnvFileExists) {
        this._logDeprecation(
          'LOAD_VARIABLES_FROM_ENV_FILES',
          'Detected ".env" files. Note that Framework now supports loading variables from those files ' +
            'when "useDotenv: true" is set (and that will be the default from next major release)'
        );
      }
    }
  }

  async run() {
    if (this.cli.displayHelp(this.processedInput)) {
      return;
    }
    this.cli.suppressLogIfPrintCommand(this.processedInput);

    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands);

    // populate variables after --help, otherwise help may fail to print
    // (https://github.com/serverless/serverless/issues/2041)
    await this.variables.populateService(this.pluginManager.cliOptions);

    // merge arrays after variables have been populated
    // (https://github.com/serverless/serverless/issues/3511)
    this.service.mergeArrays();

    // populate function names after variables are loaded in case functions were externalized
    // (https://github.com/serverless/serverless/issues/2997)
    this.service.setFunctionNames(this.processedInput.options);

    // If in context of service, validate the service configuration
    if (this.config.servicePath) this.service.validate();

    // trigger the plugin lifecycle when there's something which should be processed
    await this.pluginManager.run(this.processedInput.commands);
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
    return logDeprecation(code, message, { serviceConfig: this.service });
  }

  // To be used by external plugins
  logDeprecation(code, message) {
    return this._logDeprecation(`EXT_${ensureString(code)}`, ensureString(message));
  }
}

module.exports = Serverless;
