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

    this.instances = {};
    this.instances.config = new Config(this, config);
    this.instances.yamlParser = new YamlParser(this);
    this.instances.pluginManager = new PluginManager(this);
    this.instances.utils = new Utils(this);
    this.instances.service = new Service(this);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.PluginManager = PluginManager;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Error = SError;

    this.instances.pluginManager.loadAllPlugins();

    this.instances.cli = new CLI(this, configObj.interactive);

    this.commandsToBeProcessed = this.instances.cli.processCommands();
  }

  runCommand() {
    if (this.commandsToBeProcessed.length) {
      this.instances.pluginManager.runCommand(this.commandsToBeProcessed);
    }
  }

  getVersion() {
    return this.version;
  }
}

module.exports = Serverless;
