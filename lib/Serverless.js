'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const os = require('os');
const chalk = require('chalk');
const ensureString = require('type/string/ensure');
const updateNotifier = require('update-notifier');
const resolve = require('ncjsm/resolve');
const isModuleNotFoundError = require('ncjsm/is-module-not-found-error');
const pkg = require('../package.json');
const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const Variables = require('./classes/Variables');
const ConfigSchemaHandler = require('./classes/ConfigSchemaHandler');
const ServerlessError = require('./classes/Error').ServerlessError;
const Version = require('./../package.json').version;
const isStandaloneExecutable = require('./utils/isStandaloneExecutable');
const resolveCliInput = require('./utils/resolveCliInput');
const logDeprecation = require('./utils/logDeprecation');

const installationMaintananceCommands = new Set(['uninstall', 'upgrade']);

class Serverless {
  constructor(config) {
    let configObject = config;
    configObject = configObject || {};

    this.providers = {};

    this.version = Version;

    this.yamlParser = new YamlParser(this);
    this.utils = new Utils(this);
    this.service = new Service(this);
    this.variables = new Variables(this);
    this.pluginManager = new PluginManager(this);
    this.configSchemaHandler = new ConfigSchemaHandler(this);

    // use the servicePath from the options or try to find it in the CWD
    this.cliInputArgv = process.argv.slice(2);
    configObject.servicePath =
      configObject.servicePath ||
      this.utils.findServicePath(resolveCliInput(this.cliInputArgv).options.config);

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

  init() {
    // create an instanceId (can be e.g. used when a predictable random value is needed)
    this.instanceId = new Date().getTime().toString();

    // create a new CLI instance
    this.cli = new this.classes.CLI(this, this.cliInputArgv);

    // get an array of commands and options that should be processed
    this.processedInput = this.cli.processInput();

    // load config file
    return this.pluginManager
      .loadConfigFile()
      .then(() => this.eventuallyFallbackToLocal())
      .then(() => {
        if (this.isOverridenByLocal) return null;
        // set the options and commands which were processed by the CLI
        this.pluginManager.setCliOptions(this.processedInput.options);
        this.pluginManager.setCliCommands(this.processedInput.commands);

        if (!installationMaintananceCommands.has(this.processedInput.commands[0])) {
          // Check if update is available
          const notifier = updateNotifier({ pkg });
          if (notifier.update && notifier.update.type !== 'major') {
            notifier.notify({
              message: isStandaloneExecutable
                ? `Update available ${chalk.dim(notifier.update.current)}${chalk.reset(
                    ' → '
                  )}${chalk.green(notifier.update.latest)} \nRun ${chalk.cyan(
                    'serverless upgrade'
                  )} to update`
                : null,
            });
          }
        }

        return this.service
          .load(this.processedInput.options)
          .then(() => {
            // load all plugins
            return this.pluginManager.loadAllPlugins(this.service.plugins);
          })
          .then(() => {
            // give the CLI the plugins and commands so that it can print out
            // information such as options when the user enters --help
            this.cli.setLoadedPlugins(this.pluginManager.getPlugins());
            this.cli.setLoadedCommands(this.pluginManager.getCommands());
            return this.pluginManager.updateAutocompleteCacheFile();
          });
      });
  }
  eventuallyFallbackToLocal() {
    return resolve(process.cwd(), 'serverless').then(
      ({ realPath }) => {
        if (realPath === __filename) {
          this.isLocallyInstalled = true;
          return null;
        }
        if (!this.pluginManager.serverlessConfigFile) return null;
        if (this.pluginManager.serverlessConfigFile.enableLocalInstallationFallback == null) {
          this._logDeprecation(
            'LOCAL_INSTALLATION_FALLBACK',
            'Local installation of Serverless detected. Starting with next major version, CLI ' +
              'will run it instead of globally installed version.\n' +
              'Set "enableLocalInstallationFallback" to "true" to switch to new behavior now, ' +
              'set to "false" to keep current behavior and hide this message'
          );
          return null;
        }
        if (!this.pluginManager.serverlessConfigFile.enableLocalInstallationFallback) {
          return null;
        }
        this.cli.log('Running "serverless" installed locally (in service node_modules)');
        // TODO: Replace below fallback logic with more straightforward one at top of the CLI
        // when we willl drop support for the "disableLocalInstallationFallback" setting
        this.isOverridenByLocal = true;
        const ServerlessLocal = require(realPath);
        const serverlessLocal = new ServerlessLocal();
        this.invokedInstance = serverlessLocal;
        return serverlessLocal.init();
      },
      error => {
        if (!isModuleNotFoundError(error, 'serverless')) throw error;
      }
    );
  }

  run() {
    if (this.cli.displayHelp(this.processedInput)) {
      return BbPromise.resolve();
    }
    this.cli.suppressLogIfPrintCommand(this.processedInput);

    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands);

    // populate variables after --help, otherwise help may fail to print
    // (https://github.com/serverless/serverless/issues/2041)
    return this.variables.populateService(this.pluginManager.cliOptions).then(() => {
      // merge arrays after variables have been populated
      // (https://github.com/serverless/serverless/issues/3511)
      this.service.mergeArrays();

      // populate function names after variables are loaded in case functions were externalized
      // (https://github.com/serverless/serverless/issues/2997)
      this.service.setFunctionNames(this.processedInput.options);

      // validate the service configuration, now that variables are loaded
      this.service.validate();

      // trigger the plugin lifecycle when there's something which should be processed
      return this.pluginManager.run(this.processedInput.commands);
    });
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
