'use strict';

require('shelljs/global');

const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
const PluginManager = require('./classes/PluginManager');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');
const Version = require('./../package.json').version;

class Serverless {

  constructor(config) {
    let configObj = config;
    configObj = configObj || {};

    this.instances = {};

    this.version = Version;

    this.instances.cli = new CLI(this);
    this.instances.config = new Config(this, configObj);
    this.instances.yamlParser = new YamlParser(this);
    this.instances.PluginManager = new PluginManager(this);
    this.instances.utils = new Utils(this);
    this.instances.service = new Service(this);
    this.classes = {};
    this.classes.Service = Service;
  }

  getVersion() {
    return this.version;
  }
}

module.exports = Serverless;
