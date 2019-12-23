'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const os = require('os');
const chalk = require('chalk');
const updateNotifier = require('update-notifier');
const minimist = require('minimist');
const pkg = require('../package.json');
const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const Variables = require('./classes/Variables');
const ServerlessError = require('./classes/Error').ServerlessError;
const Version = require('./../package.json').version;
const isStandaloneExecutable = require('./utils/isStandaloneExecutable');

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

    // use the servicePath from the options or try to find it in the CWD
    configObject.servicePath =
      configObject.servicePath ||
      this.utils.findServicePath(minimist(process.argv.slice(2)).config);

    this.config = new Config(this, configObject);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Variables = Variables;
    this.classes.Error = ServerlessError;
    this.classes.PluginManager = PluginManager;

    this.serverlessDirPath = path.join(os.homedir(), '.serverless');
    this.isStandaloneExecutable = isStandaloneExecutable;
  }

  init() {
    // create an instanceId (can be e.g. used when a predictable random value is needed)
    this.instanceId = new Date().getTime().toString();

    // create a new CLI instance
    this.cli = new this.classes.CLI(this);

    // get an array of commands and options that should be processed
    this.processedInput = this.cli.processInput();

    // load config file
    return this.pluginManager
      .loadConfigFile()
      .then(() => {
        // set the options and commands which were processed by the CLI
        this.pluginManager.setCliOptions(this.processedInput.options);
        this.pluginManager.setCliCommands(this.processedInput.commands);

        if (!installationMaintananceCommands.has(this.processedInput.commands[0])) {
          // Check if update is available
          const notifier = updateNotifier({ pkg });
          notifier.notify({
            message:
              isStandaloneExecutable && notifier.update
                ? `Update available ${chalk().dim(notifier.update.current)}${chalk().reset(
                    ' → '
                  )}${chalk().green(notifier.update.latest)} \nRun ${chalk().cyan(
                    'serverless upgrade'
                  )} to update`
                : null,
          });
        }

        return this.service.load(this.processedInput.options);
      })
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
  }

  run() {
    this.utils.logStat(this).catch(() => BbPromise.resolve());

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
}

module.exports = Serverless;
