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
        const config = require(serviceFilePath);

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

    const serverlessFile = serverlessFileParam;
    // basic service level validation
    const version = this.serverless.utils.getVersion();
    const ymlVersion = serverlessFile.frameworkVersion;
    if (ymlVersion && !semver.satisfies(version, ymlVersion)) {
      const errorMessage = [
        `The Serverless version (${version}) does not satisfy the`,
        ` "frameworkVersion" (${ymlVersion}) in ${serviceFilename}`,
      ].join('');
      throw new ServerlessError(errorMessage);
    }
    if (!serverlessFile.service) {
      throw new ServerlessError(`"service" property is missing in ${serviceFilename}`);
    }
    if (_.isObject(serverlessFile.service) && !serverlessFile.service.name) {
      throw new ServerlessError(`"service" is missing the "name" property in ${serviceFilename}`);   // eslint-disable-line max-len
    }
    if (!serverlessFile.provider) {
      throw new ServerlessError(`"provider" property is missing in ${serviceFilename}`);
    }

    // #######################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/plugins/print/print.js ##
    // #######################################################################
    // #####################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/classes/Variables.js ##
    // ##   there, see `getValueFromSelf`                                 ##
    // ##   here, see below                                               ##
    // #####################################################################
    if (!_.isObject(serverlessFile.provider)) {
      const providerName = serverlessFile.provider;
      serverlessFile.provider = {
        name: providerName,
      };
    }

    if (_.isObject(serverlessFile.service)) {
      that.serviceObject = serverlessFile.service;
      that.service = serverlessFile.service.name;
    } else {
      that.serviceObject = { name: serverlessFile.service };
      that.service = serverlessFile.service;
    }

    that.app = serverlessFile.app;
    that.tenant = serverlessFile.tenant;
    that.custom = serverlessFile.custom;
    that.plugins = serverlessFile.plugins;
    that.resources = serverlessFile.resources;
    that.functions = serverlessFile.functions || {};

    // merge so that the default settings are still in place and
    // won't be overwritten
    that.provider = _.merge(that.provider, serverlessFile.provider);

    if (serverlessFile.package) {
      that.package.individually = serverlessFile.package.individually;
      that.package.path = serverlessFile.package.path;
      that.package.artifact = serverlessFile.package.artifact;
      that.package.exclude = serverlessFile.package.exclude;
      that.package.include = serverlessFile.package.include;
      that.package.excludeDevDependencies = serverlessFile.package.excludeDevDependencies;
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

  getAllFunctionsNames() {
    return this.getAllFunctions().map((func) => this.getFunction(func).name);
  }

  getFunction(functionName) {
    if (functionName in this.functions) {
      return this.functions[functionName];
    }
    throw new ServerlessError(`Function "${functionName}" doesn't exist in this Service`);
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
