'use strict';

require('shelljs/global');

const path = require('path');
const BbPromise = require('bluebird');
const os = require('os');
const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const Variables = require('./classes/Variables');
const ServerlessError = require('./classes/Error').ServerlessError;
const Version = require('./../package.json').version;

class Serverless {
  constructor(config) {
    let configObject = config;
    configObject = configObject || {};

    this.providers = {};

    this.version = Version;

    this.yamlParser = new YamlParser(this);
    this.pluginManager = new PluginManager(this);
    this.utils = new Utils(this);
    this.service = new Service(this);
    this.variables = new Variables(this);

    // use the servicePath from the options or try to find it in the CWD
    configObject.servicePath = configObject.servicePath || this.utils.findServicePath();

    this.config = new Config(this, configObject);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.PluginManager = PluginManager;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Variables = Variables;
    this.classes.Error = ServerlessError;

    this.serverlessDirPath = path.join(os.homedir(), '.serverless');
  }

  init() {
    // create a new CLI instance
    this.cli = new CLI(this);

    // get an array of commands and options that should be processed
    this.processedInput = this.cli.processInput();

    // set the options and commands which were processed by the CLI
    this.pluginManager.setCliOptions(this.processedInput.options);
    this.pluginManager.setCliCommands(this.processedInput.commands);

    return this.service.load(this.processedInput.options)
      .then(() => {
        // load all plugins
        this.pluginManager.loadAllPlugins(this.service.plugins);

        // give the CLI the plugins and commands so that it can print out
        // information such as options when the user enters --help
        this.cli.setLoadedPlugins(this.pluginManager.getPlugins());
        this.cli.setLoadedCommands(this.pluginManager.getCommands());
      });
  }

  run() {
    this.utils.logStat(this).catch(() => BbPromise.resolve());

    if (this.cli.displayHelp(this.processedInput)) {
      return BbPromise.resolve();
    }

    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands);

    // populate variables after --help, otherwise help may fail to print
    // (https://github.com/serverless/serverless/issues/2041)
    this.variables.populateService(this.pluginManager.cliOptions);

    // validate the service configuration, now that variables are loaded
    this.service.validate();

    // trigger the plugin lifecycle when there's something which should be processed
    return this.pluginManager.run(this.processedInput.commands);
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
