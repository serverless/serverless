'use strict';

require('shelljs/global');

const CLI = require('./classes/CLI');
const Config = require('./classes/Config');
const YamlParser = require('./classes/YamlParser');
//const PluginManagement = require('./classes/PluginManagement');
const Utils = require('./classes/Utils');
const Service = require('./classes/Service');

class Serverless {

  constructor(config) {
    config = config || {};

    this.instances = {};

    this._version = require('./../package.json').version;

    this.instances.cli = new CLI(this);
    this.instances.config = new Config(this, config);
    this.instances.yamlParser = new YamlParser(this);
    //this.instances.pluginManagement = new PluginManagement(this);
    this.instances.utils = new Utils(this);
    this.instances.service = new Service(this);
    this.classes = {};
    this.classes.Service = Service;
  }

  getVersion() {
    return this._version;
  }
}

module.exports = Serverless;
