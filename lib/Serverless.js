'use strict';

require('shelljs/global');

const BbPromise = require('bluebird');
const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const SError = require('./classes/Error').SError;
const Version = require('./../package.json').version;

class Serverless {
  constructor(config) {
    let configObject = config;
    configObject = configObject || {};

    this.version = Version;

    this.yamlParser = new YamlParser(this);
    this.pluginManager = new PluginManager(this);
    this.utils = new Utils(this);
    this.service = new Service(this);

    // use the servicePath from the options or try to find it in the CWD
    configObject.servicePath = configObject.servicePath || this.utils.findServicePath();

    this.config = new Config(this, configObject);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.PluginManager = PluginManager;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Error = SError;
  }

  init() {
    // create a new CLI instance
    this.cli = new CLI(this);
    this.cli.asciiGreeting();

    // get an array of commands and options that should be processed
    this.processedInput = this.cli.processInput();

    // set the options
    this.pluginManager.setOptions(this.processedInput.options);

    return this.service.load(this.processedInput.options)
      .then(() => {
        // load all plugins
        this.pluginManager.loadAllPlugins();

        // give the CLI the plugins so that it can print out plugin information
        // such as options when the user enters --help
        this.cli.setLoadedPlugins(this.pluginManager.getPlugins());
      });
  }

  run() {
    if (!this.cli.displayHelp(this.processedInput) && this.processedInput.commands.length) {
      // trigger the plugin lifecycle when there's something which should be processed
      return this.pluginManager.run(this.processedInput.commands);
    }

    return BbPromise.resolve();
  }

  getVersion() {
    return this.version;
  }
}

module.exports = Serverless;
