'use strict';

require('shelljs/global');

const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const SError = require('./classes/Error');
const Version = require('./../package.json').version;

class Serverless {
  constructor(config) {
    let configObj = config;
    configObj = configObj || {};

    this.version = Version;

    this.config = new Config(this, config);
    this.yamlParser = new YamlParser(this);
    this.pluginManager = new PluginManager(this);
    this.utils = new Utils(this);
    this.service = new Service(this);
    this.cli = new CLI(this, configObj.interactive);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.PluginManager = PluginManager;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Error = SError;

    this.pluginManager.loadAllPlugins();

    this.inputToBeProcessed = this.cli.processInput();
  }

  run() {
    if (this.inputToBeProcessed.commands.length) {
      this.pluginManager.run(this.inputToBeProcessed.commands,
        this.inputToBeProcessed.options);
    }
  }

  getVersion() {
    return this.version;
  }
}

module.exports = Serverless;
