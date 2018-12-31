'use strict';

const ServerlessError = require('./Error').ServerlessError;
const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const semver = require('semver');

class Service {
  constructor(serverless, data) {
    // #######################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/plugins/print/print.js ##
    // #######################################################################
    this.serverless = serverless;
    this.serverlessFile = {};

    // Default properties
    this.service = null;
    this.serviceObject = null;
    this.provider = {
      stage: 'dev',
      region: 'us-east-1',
      variableSyntax: '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}',
    };
    this.custom = {};
    this.plugins = [];
    this.pluginsData = {};
    this.functions = {};
    this.resources = {};
    this.package = {};

    if (data) this.update(data);
  }

  load(rawOptions) {
    const that = this;
    const options = rawOptions || {};
    options.stage = options.stage || options.s;
    options.region = options.region || options.r;
    const servicePath = this.serverless.config.servicePath;

    // skip if the service path is not found
    // because the user might be creating a new service
    if (!servicePath) {
      return BbPromise.resolve();
    }

    // List of supported service filename variants.
    // The order defines the precedence.
    const serviceFilenames = [
      'serverless.yaml',
      'serverless.yml',
      'serverless.json',
      'serverless.js',
    ];

    const serviceFilePaths = _.map(serviceFilenames, filename => path.join(servicePath, filename));
    const serviceFileIndex = _.findIndex(serviceFilePaths,
      filename => this.serverless.utils.fileExistsSync(filename)
    );

    // Set the filename if found, otherwise set the preferred variant.
    const serviceFilePath = serviceFileIndex !== -1 ?
      serviceFilePaths[serviceFileIndex] :
      _.first(serviceFilePaths);
    const serviceFilename = serviceFileIndex !== -1 ?
      serviceFilenames[serviceFileIndex] :
      _.first(serviceFilenames);

    if (serviceFilename === 'serverless.js') {
      return BbPromise.try(() => {
        // use require to load serverless.js file
        // eslint-disable-next-line global-require
        const configExport = require(serviceFilePath);
        // In case of a promise result, first resolve it.
        return configExport;
      }).then(config => {
        if (!_.isPlainObject(config)) {
          throw new Error('serverless.js must export plain object');
        }

        return that.loadServiceFileParam(serviceFilename, config);
      });
    }

    return that.serverless.yamlParser
      .parse(serviceFilePath)
      .then((serverlessFileParam) =>
        that.loadServiceFileParam(serviceFilename, serverlessFileParam)
      );
  }

  loadServiceFileParam(serviceFilename, serverlessFileParam) {
    const that = this;

    this.serverlessFile.param = serverlessFileParam;
    this.serverlessFile.name = serviceFilename;

    // #######################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/plugins/print/print.js ##
    // #######################################################################
    // #####################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/classes/Variables.js ##
    // ##   there, see `getValueFromSelf`                                 ##
    // ##   here, see below                                               ##
    // #####################################################################
    if (!_.isObject(this.serverlessFile.param.provider)) {
      const providerName = this.serverlessFile.param.provider;
      this.serverlessFile.param.provider = {
        name: providerName,
      };
    }

    if (_.isObject(this.serverlessFile.param.service)) {
      that.serviceObject = this.serverlessFile.param.service;
      that.service = this.serverlessFile.param.service.name;
    } else {
      that.serviceObject = { name: this.serverlessFile.param.service };
      that.service = this.serverlessFile.param.service;
    }

    that.app = this.serverlessFile.param.app;
    that.tenant = this.serverlessFile.param.tenant;
    that.custom = this.serverlessFile.param.custom;
    that.plugins = this.serverlessFile.param.plugins;
    that.resources = this.serverlessFile.param.resources;
    that.functions = this.serverlessFile.param.functions || {};

    // merge so that the default settings are still in place and
    // won't be overwritten
    that.provider = _.merge(that.provider, this.serverlessFile.param.provider);

    if (this.serverlessFile.param.package) {
      that.package.individually = this.serverlessFile.param.package.individually;
      that.package.path = this.serverlessFile.param.package.path;
      that.package.artifact = this.serverlessFile.param.package.artifact;
      that.package.exclude = this.serverlessFile.param.package.exclude;
      that.package.include = this.serverlessFile.param.package.include;
      that.package.excludeDevDependencies =
                 this.serverlessFile.param.package.excludeDevDependencies;
    }

    if (that.provider.name === 'aws') {
      that.layers = this.serverlessFile.param.layers || {};
    }

    return this;
  }

  setFunctionNames(rawOptions) {
    const that = this;
    const options = rawOptions || {};
    options.stage = options.stage || options.s;
    options.region = options.region || options.r;

    // setup function.name property
    const stageNameForFunction = options.stage || this.provider.stage;
    _.forEach(that.functions, (functionObj, functionName) => {
      if (!functionObj.events) {
        that.functions[functionName].events = [];
      }

      if (!functionObj.name) {
        that.functions[functionName].name =
          `${that.service}-${stageNameForFunction}-${functionName}`;
      }
    });
  }

  mergeArrays() {
    ['resources', 'functions'].forEach(key => {
      if (Array.isArray(this[key])) {
        this[key] = this[key].reduce((memo, value) => {
          if (value) {
            if (typeof value === 'object') {
              return _.merge(memo, value);
            }
            throw new Error(`Non-object value specified in ${key} array: ${value}`);
          }

          return memo;
        }, {});
      }
    });
  }

  validate() {
    _.forEach(this.functions, (functionObj, functionName) => {
      if (!_.isArray(functionObj.events)) {
        throw new ServerlessError(`Events for "${functionName}" must be an array,` +
                          ` not an ${typeof functionObj.events}`);
      }
    });

    // basic service level validation
    if (!_.isEmpty(this.serverlessFile)) {
      const version = this.serverless.utils.getVersion();
      const ymlVersion = this.serverlessFile.param.frameworkVersion;

      if (ymlVersion && !semver.satisfies(version, ymlVersion)) {
        const errorMessage = [
          `The Serverless version (${version}) does not satisfy the`,
          ` "frameworkVersion" (${ymlVersion}) in ${this.serverlessFile.name}`,
        ].join('');
        throw new ServerlessError(errorMessage);
      }

      if (!this.serverlessFile.param.service) {
        throw new ServerlessError(`"service" property is missing in ${this.serverlessFile.name}`);
      }

      if (_.isObject(this.serverlessFile.param.service) &&
          !this.serverlessFile.param.service.name) {
        throw new ServerlessError(`"service" is missing the "name" property
                                  in ${this.serverlessFile.name}`);
      }

      if (!this.serverlessFile.param.provider) {
        throw new ServerlessError(`"provider" property is missing in ${this.serverlessFile.name}`);
      }
    }

    return this;
  }

  update(data) {
    return _.merge(this, data);
  }

  getServiceName() {
    return this.serviceObject.name;
  }

  getServiceObject() {
    return this.serviceObject;
  }

  getAllFunctions() {
    return Object.keys(this.functions);
  }

  getAllLayers() {
    return this.layers ? Object.keys(this.layers) : [];
  }

  getAllFunctionsNames() {
    return this.getAllFunctions().map((func) => this.getFunction(func).name);
  }

  getFunction(functionName) {
    if (functionName in this.functions) {
      return this.functions[functionName];
    }
    throw new ServerlessError(`Function "${functionName}" doesn't exist in this Service`);
  }

  getLayer(layerName) {
    if (layerName in this.layers) {
      return this.layers[layerName];
    }
    throw new ServerlessError(`Layer "${layerName}" doesn't exist in this Service`);
  }

  getEventInFunction(eventName, functionName) {
    const event = this.getFunction(functionName).events
      .find(e => Object.keys(e)[0] === eventName);
    if (event) {
      return event;
    }
    throw new ServerlessError(`Event "${eventName}" doesn't exist in function "${functionName}"`);
  }

  getAllEventsInFunction(functionName) {
    return this.getFunction(functionName).events;
  }

  publish(dataParam) {
    const data = dataParam || {};
    this.pluginsData = _.merge(this.pluginsData, data);
  }
}

module.exports = Service;
