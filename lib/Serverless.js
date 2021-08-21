'use strict';

const path = require('path');
const os = require('os');
const ensureString = require('type/string/ensure');
const ensureArray = require('type/array/ensure');
const ensurePlainObject = require('type/plain-object/ensure');
const _ = require('lodash');
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
const commmandsSchema = require('./cli/commands-schema');
const resolveCliInput = require('./cli/resolve-input');
const readConfiguration = require('./configuration/read');
const conditionallyLoadDotenv = require('./cli/conditionally-load-dotenv');

const serverlessPath = path.resolve(__dirname, '..');

class Serverless {
  constructor(config) {
    let configObject = config;
    configObject = configObject || {};
    this._isInvokedByGlobalInstallation = Boolean(configObject._isInvokedByGlobalInstallation);

    if (configObject.serviceDir != null) {
      // Modern intialization way, to be the only supported way with v3
      this.serviceDir = path.resolve(
        ensureString(configObject.serviceDir, {
          name: 'config.serviceDir',
          Error: ServerlessError,
          errorCode: 'INVALID_NON_STRING_SERVICE_DIR',
        })
      );
      this.configurationFilename = ensureString(configObject.configurationFilename, {
        name: 'config.configurationFilename',
        Error: ServerlessError,
        errorCode: 'INVALID_NON_STRING_CONFIGURATION_FILENAME',
      });
      if (path.isAbsolute(this.configurationFilename)) {
        throw new ServerlessError(
          `"config.configurationFilename" cannot be absolute path. Received: ${configObject.configurationFilename}`,
          'INVALID_ABSOLUTE_PATH_CONFIGURATION_FILENAME'
        );
      }
      this.configurationInput = ensurePlainObject(configObject.configuration, {
        name: 'config.configuration',
        Error: ServerlessError,
        errorCode: 'INVALID_NON_OBJECT_CONFIGURATION',
      });
      this.isConfigurationInputResolved = Boolean(configObject.isConfigurationResolved);
    } else if (configObject.configurationPath != null) {
      // Semi-modern initialization way, mid-step introduced over the course of v2 refactor
      const configurationPath = path.resolve(
        ensureString(configObject.configurationPath, {
          name: 'config.configurationPath',
          Error: ServerlessError,
          errorCode: 'INVALID_NON_STRING_CONFIGURATION_PATH',
        })
      );
      this.serviceDir = process.cwd();
      this.configurationFilename = configurationPath.slice(this.serviceDir.length + 1);
      this.configurationInput = ensurePlainObject(configObject.configuration, {
        isOptional: true,
        name: 'config.configuration',
        Error: ServerlessError,
        errorCode: 'INVALID_NON_OBJECT_CONFIGURATION',
      });
      if (this.configurationInput) {
        this.isConfigurationInputResolved = Boolean(configObject.isConfigurationResolved);
      }
      this._shouldReportMissingServiceDeprecation = true;
    } else if (
      configObject.configurationPath === undefined &&
      configObject.serviceDir === undefined
    ) {
      // Old intialization way
      this._shouldResolveConfigurationInternally = true;
      this._shouldReportMissingServiceDeprecation = true;
    }
    const commands = ensureArray(configObject.commands, { isOptional: true });
    let options = ensurePlainObject(configObject.options, { isOptional: true });
    // This is a temporary workaround to ensure that original `options` are not mutated
    // Should be removed after addressing: https://github.com/serverless/serverless/issues/2582
    if (options) options = { ...options };
    if (!commands || !options) {
      this._shouldReportCommandsDeprecation = true;
      this.processedInput = resolveCliInput();
    } else {
      this.processedInput = { commands, options };
    }
    this.hasResolvedCommandsExternally = Boolean(configObject.hasResolvedCommandsExternally);
    this.isTelemetryReportedExternally = Boolean(configObject.isTelemetryReportedExternally);

    // Due to design flaw properties of configObject (which is to be merged onto `this.config`)
    // also are subject to variables resolution.
    // To avoid that we clear configObject after consuming it's properties.
    // Once new variables engine is in, we can remove that patch
    delete configObject.configurationPath;
    delete configObject.configuration;
    delete configObject.serviceDir;
    delete configObject._isInvokedByGlobalInstallation;
    delete configObject.commands;
    delete configObject.isConfigurationResolved;
    delete configObject.hasResolvedCommandsExternally;
    delete configObject.isTelemetryReportedExternally;
    delete configObject.options;

    this.providers = {};

    this.version = version;

    this.yamlParser = new YamlParser(this);
    this.utils = new Utils(this);
    this.service = new Service(this);
    this.variables = new Variables(this);
    this.pluginManager = new PluginManager(this);
    this.configSchemaHandler = new ConfigSchemaHandler(this);

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

    // TODO: Remove once "@serverless/dashboard-plugin" is integrated into this repository
    this._commandsSchema = commmandsSchema;
  }

  async init() {
    if (this._isInvokedByGlobalInstallation) {
      logDeprecation.defaultMode = 'warn';
      logDeprecation.flushBuffered();
    } else {
      if (this._shouldReportMissingServiceDeprecation) {
        this._logDeprecation(
          'MISSING_SERVICE_CONFIGURATION',
          'Serverless constructor expects service configuration details to be provided.\n' +
            'Starting from next major Serverless will no longer auto resolve it internally.'
        );
      }
      if (this._shouldReportCommandsDeprecation) {
        this._logDeprecation(
          'MISSING_COMMANDS_OR_OPTIONS_AT_CONSTRUCTION',
          'Serverless constructor expects resolved CLI commands and options to be provided ' +
            'via "config.commands" and "config.options".\n' +
            'Starting from next major Serverless will no longer auto resolve CLI arguments internally.'
        );
      }
    }
    if (this._shouldResolveConfigurationInternally) {
      const configurationPath = await resolveConfigurationPath();
      if (configurationPath) {
        this.serviceDir = process.cwd();
        this.configurationFilename = configurationPath.slice(this.serviceDir.length + 1);
      }
    }
    if (this.configurationFilename && !this.configurationInput) {
      this.configurationInput = await (async () => {
        try {
          return await readConfiguration(path.resolve(this.serviceDir, this.configurationFilename));
        } catch (error) {
          if (resolveCliInput().isHelpRequest) return null;
          throw error;
        }
      })();
    }

    // create an instanceId (can be e.g. used when a predictable random value is needed)
    this.instanceId = new Date().getTime().toString();

    // create a new CLI instance
    this.cli = new this.classes.CLI(this);

    await this.eventuallyFallbackToLocal();
    if (this.isOverridenByLocal) return;
    eventuallyUpdate(this);
    // set the options and commands which were processed by the CLI
    this.pluginManager.setCliOptions(this.processedInput.options);
    this.pluginManager.setCliCommands(this.processedInput.commands);

    // TODO: Remove with next major
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
    const localServerlessPath = resolveLocalServerlessPath();
    if (!localServerlessPath) return;
    if (localServerlessPath === serverlessPath) {
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
    logDeprecation.defaultMode = 'warn';
    logDeprecation.flushBuffered();
    this.cli.log('Running "serverless" installed locally (in service node_modules)');
    // TODO: Replace below fallback logic with more straightforward one at top of the CLI
    // when we willl drop support for the "disableLocalInstallationFallback" setting
    this.isOverridenByLocal = true;
    const ServerlessLocal = require(localServerlessPath);
    const serverlessLocal = new ServerlessLocal({
      serviceDir: this.serviceDir || null,
      configurationFilename: this.configurationFilename,
      configurationPath:
        (this.configurationFilename && path.resolve(this.serviceDir, this.configurationFilename)) ||
        null,
      configuration: this.configurationInput,
      isConfigurationResolved: this.isConfigurationInputResolved,
      hasResolvedCommandsExternally: this.hasResolvedCommandsExternally,
      isTelemetryReportedExternally: this.isTelemetryReportedExternally,
      commands: this.processedInput.commands,
      options: this.processedInput.options,
      _isInvokedByGlobalInstallation: true,
    });
    serverlessLocal.isLocallyInstalled = true;
    if (!serverlessLocal._isInvokedByGlobalInstallation) {
      // if we fallback to older version it may recognize "isInvokedByGlobalInstallation" instead
      // of "_isInvokedByGlobalInstallation". Ensure to set it, in such case
      serverlessLocal.isInvokedByGlobalInstallation = true;
    }
    this.invokedInstance = serverlessLocal;
    await serverlessLocal.init();
  }

  async loadEnvVariables() {
    const configurationInput = this.configurationInput;
    if (this.configurationInput == null) return;
    await conditionallyLoadDotenv(this.processedInput.options, configurationInput);
  }

  async run() {
    if (this._isInvokedByGlobalInstallation) {
      // TODO: Remove with next major
      // Ensure to have resolve-input populated with right result
      const commandsSchema = require('./cli/commands-schema/resolve-final')(
        this.pluginManager.externalPlugins,
        {
          providerName: this.service.provider.name,
          configuration: this.configurationInput,
        }
      );
      resolveCliInput.clear();
      const { commands, options, isHelpRequest } = resolveCliInput(commandsSchema);
      this.processedInput.commands = this.pluginManager.cliCommands = commands;
      this.processedInput.options = this.pluginManager.cliOptions = options;
      if (options.version) {
        require('./cli/render-version')();
        return;
      }
      if (
        !this.isConfigurationInputResolved &&
        this.serviceDir &&
        !_.get(this.configurationInput, 'provider.variableSyntax')
      ) {
        // We're in a local fallback from other version which may not have a new variables engine
        // (or have it incomplete). Therefore resolve variables with a new resolver
        const resolveVariablesMeta = require('./configuration/variables/resolve-meta');
        const isPropertyResolved = require('./configuration/variables/is-property-resolved');
        const resolveVariables = require('./configuration/variables/resolve');
        const eventuallyReportVariableResolutionErrors = require('./configuration/variables/eventually-report-resolution-errors');
        const resolveProviderName = require('./configuration/resolve-provider-name');
        const filterSupportedOptions = require('./cli/filter-supported-options');

        const variablesMeta = resolveVariablesMeta(this.configurationInput);
        // IIFE for maintanance convinience
        await (async () => {
          if (!variablesMeta.size) return;
          const configurationPath = path.resolve(this.serviceDir, this.configurationFilename);
          if (
            eventuallyReportVariableResolutionErrors(
              configurationPath,
              this.configurationInput,
              variablesMeta
            )
          ) {
            return;
          }

          for (const coreProperty of [
            'app',
            'disabledDeprecations',
            'org',
            'provider\0name',
            'useDotenv',
            'variablesResolutionMode',
          ]) {
            if (!isPropertyResolved(variablesMeta, coreProperty)) return;
          }
          const providerName = resolveProviderName(this.configurationInput);
          const resolverConfiguration = {
            serviceDir: this.serviceDir,
            configuration: this.configurationInput,
            variablesMeta,
            sources: {
              env: require('./configuration/variables/sources/env'),
              file: require('./configuration/variables/sources/file'),
              opt: require('./configuration/variables/sources/opt'),
              self: require('./configuration/variables/sources/self'),
              strToBool: require('./configuration/variables/sources/str-to-bool'),
              sls: require('./configuration/variables/sources/instance-dependent/get-sls')(this),
            },
            options: filterSupportedOptions(options, {
              commandSchema: resolveCliInput.commandSchema,
              providerName,
            }),
            propertyPathsToResolve: isHelpRequest ? new Set(['plugins']) : null,
          };
          if (providerName === 'aws') {
            Object.assign(resolverConfiguration.sources, {
              cf: require('./configuration/variables/sources/instance-dependent/get-cf')(this),
              s3: require('./configuration/variables/sources/instance-dependent/get-s3')(this),
              ssm: require('./configuration/variables/sources/instance-dependent/get-ssm')(this),
              aws: require('./configuration/variables/sources/instance-dependent/get-aws')(this),
            });
          }
          if (this.configurationInput.org && this.pluginManager.dashboardPlugin) {
            for (const [sourceName, sourceConfig] of Object.entries(
              this.pluginManager.dashboardPlugin.configurationVariablesSources
            )) {
              resolverConfiguration.sources[sourceName] = sourceConfig;
            }
          }
          resolverConfiguration.fulfilledSources = new Set(
            Object.keys(resolverConfiguration.sources)
          );
          if (!(this.configurationInput.variablesResolutionMode >= 20210326)) {
            // New resolver, resolves just recognized CLI options. Therefore we cannot assume
            // we have full "opt" source data if user didn't explicitly switch to new resolver
            resolverConfiguration.fulfilledSources.delete('opt');
          }

          const resolverExternalPluginSources = require('../lib/configuration/variables/sources/resolve-external-plugin-sources');
          resolverExternalPluginSources(
            this.configurationInput,
            resolverConfiguration,
            this.pluginManager.externalPlugins
          );
          await resolveVariables(resolverConfiguration);
          if (!variablesMeta.size) {
            this.isConfigurationInputResolved = true;
            return;
          }
          eventuallyReportVariableResolutionErrors(
            configurationPath,
            this.configurationInput,
            variablesMeta
          );
        })();
      }
    }

    // Ensure to pick eventual variable resolution that happens after all plugins are loaded
    if (this.configurationInput) this.service.reloadServiceFileParam();

    if (this.cli.displayHelp(this.processedInput)) {
      return;
    }
    this.cli.suppressLogIfPrintCommand(this.processedInput);
    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands);

    if (!this.isConfigurationInputResolved) {
      // populate variables after --help, otherwise help may fail to print
      // (https://github.com/serverless/serverless/issues/2041)
      await this.variables.populateService(this.pluginManager.cliOptions);
    } else {
      // Some plugins resolve additional variables on their own by runnning `variables.populateObject`
      // e.g. https://github.com/serverless-operations/serverless-step-functions/blob/016da8db78f1972ba80d37941c34c8fd038fd8ca/lib/yamlParser.js#L26
      // and that requires `variableSyntax` and `options` initizalization which is guaranteed by
      // `variables.populateService`. Below lines ensure they're set
      this.variables.loadVariableSyntax();
      this.variables.options = this.pluginManager.cliOptions;
      if (process.env.SLS_DEBUG) {
        this.cli.log(
          'Skipping variables resolution with old resolver ' +
            '(new resolver reported no more variables to resolve)'
        );
      }
    }

    if (
      process.argv.slice(2).includes('-v') &&
      _.get(resolveCliInput().commandSchema, 'options.verbose.shortcut') === 'v'
    ) {
      this._logDeprecation(
        'CLI_VERBOSE_OPTION_ALIAS',
        'Starting with v3.0.0, "-v" will no longer be supported as alias for "--verbose" option. Please use "--verbose" flag instead.'
      );
    }

    if (resolveCliInput().commands[0] !== 'plugin') {
      // merge arrays after variables have been populated
      // (https://github.com/serverless/serverless/issues/3511)
      this.service.mergeArrays();

      // populate function names after variables are loaded in case functions were externalized
      // (https://github.com/serverless/serverless/issues/2997)
      this.service.setFunctionNames(this.processedInput.options);

      // If in context of service, validate the service configuration
      if (this.serviceDir) this.service.validate();
    }
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
    return logDeprecation(code, message, { serviceConfig: this.configurationInput });
  }

  // To be used by external plugins
  logDeprecation(code, message) {
    return this._logDeprecation(`EXT_${ensureString(code)}`, ensureString(message));
  }

  // If this instance is initialized by older version of the Framework,
  // it may set "isInvokedByGlobalInstallation" directly.
  // This fallback ensures it ends at "_isInvokedByGlobalInstallation"
  set isInvokedByGlobalInstallation(value) {
    this._isInvokedByGlobalInstallation = value;
  }
  get isInvokedByGlobalInstallation() {
    return this._isInvokedByGlobalInstallation;
  }
}

module.exports = Serverless;
