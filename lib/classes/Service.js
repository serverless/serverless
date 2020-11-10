'use strict';

const { ServerlessError, logWarning } = require('./Error');
const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const semver = require('semver');
const serverlessConfigFileUtils = require('../utils/getServerlessConfigFile');
const currentVersion = require('../../package').version;

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
      variableSyntax: '\\${([^{}:]+?(?:\\(|:)(?:[^:{}][^{}]*?)?)}',
    };
    this.custom = {};
    this.plugins = [];
    this.pluginsData = {};
    this.functions = {};
    this.resources = {};
    this.package = {};
    this.configValidationMode = 'warn';
    this.disabledDeprecations = [];

    if (data) this.update(data);
  }

  load(rawOptions) {
    const options = rawOptions || {};
    if (!options.stage && options.s) options.stage = options.s;
    if (!options.region && options.r) options.region = options.r;
    const servicePath = this.serverless.config.servicePath;

    // skip if the service path is not found
    // because the user might be creating a new service
    if (!servicePath) {
      return BbPromise.resolve();
    }

    return BbPromise.all([
      serverlessConfigFileUtils.getServerlessConfigFilePath(this.serverless),
      serverlessConfigFileUtils.getServerlessConfigFile(this.serverless),
    ])
      .then(args => this.loadServiceFileParam(...args))
      .catch(error => {
        if (this.serverless.cli.isHelpRequest(this.serverless.processedInput)) {
          return null;
        }
        throw error;
      });
  }

  loadServiceFileParam(serviceFilename, serverlessFileParam) {
    this.serviceFilename = path.basename(serviceFilename);

    const serverlessFile = serverlessFileParam;
    // basic service level validation
    const version = this.serverless.utils.getVersion();
    let ymlVersion = serverlessFile.frameworkVersion;
    if (ymlVersion && !semver.validRange(ymlVersion)) {
      if (serverlessFile.configValidationMode === 'error') {
        throw new ServerlessError(
          'Configured "frameworkVersion" does not represent a valid semver version range.',
          'INVALID_FRAMEWORK_VERSION'
        );
      }
      logWarning(
        'Configured "frameworkVersion" does not represent a valid semver version range, version validation is skipped'
      );
      ymlVersion = null;
    }
    if (!this.isLocallyInstalled && !ymlVersion && process.env.SLS_DEBUG) {
      this.serverless.cli.log(
        'To ensure safe major version upgrades ensure "frameworkVersion" setting in ' +
          'service configuration ' +
          `(recommended setup: "frameworkVersion: ^${currentVersion}")\n`
      );
    }
    if (
      ymlVersion &&
      version !== ymlVersion &&
      !semver.satisfies(semver.coerce(version).raw, ymlVersion)
    ) {
      const errorMessage = [
        `The Serverless version (${version}) does not satisfy the`,
        ` "frameworkVersion" (${ymlVersion}) in ${this.serviceFilename}`,
      ].join('');
      throw new ServerlessError(errorMessage, 'FRAMEWORK_VERSION_MISMATCH');
    }
    if (!serverlessFile.service) {
      throw new ServerlessError(
        `"service" property is missing in ${this.serviceFilename}`,
        'SERVICE_NAME_MISSING'
      );
    }
    if (_.isObject(serverlessFile.service) && !serverlessFile.service.name) {
      throw new ServerlessError(
        `"service" is missing the "name" property in ${this.serviceFilename}`,
        'SERVICE_NAME_MISSING'
      ); // eslint-disable-line max-len
    }
    if (!serverlessFile.provider) {
      throw new ServerlessError(
        `"provider" property is missing in ${this.serviceFilename}`,
        'PROVIDER_NAME_MISSING'
      );
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
      this.serverless._logDeprecation(
        'SERVICE_OBJECT_NOTATION',
        'Starting from next major object notation for "service" property will no longer be ' +
          'recognized. Set "service" property directly with service name.'
      );
      this.serviceObject = serverlessFile.service;
      this.service = serverlessFile.service.name;
    } else {
      this.serviceObject = { name: serverlessFile.service };
      this.service = serverlessFile.service;
    }

    this.app = serverlessFile.app;
    this.tenant = serverlessFile.tenant;
    this.org = serverlessFile.org;
    this.custom = serverlessFile.custom;
    this.plugins = serverlessFile.plugins;
    this.resources = serverlessFile.resources;
    this.functions = serverlessFile.functions || {};
    this.configValidationMode = serverlessFile.configValidationMode || 'warn';
    this.disabledDeprecations = serverlessFile.disabledDeprecations;

    // merge so that the default settings are still in place and
    // won't be overwritten
    if (serverlessFile.provider) {
      if (serverlessFile.provider.stage == null) {
        serverlessFile.provider.stage = this.provider.stage;
      }
      if (serverlessFile.provider.variableSyntax == null) {
        serverlessFile.provider.variableSyntax = this.provider.variableSyntax;
      }
      this.provider = serverlessFile.provider;
    }

    if (serverlessFile.package) {
      this.package = serverlessFile.package;
    }

    if (this.provider.name === 'aws') {
      this.layers = serverlessFile.layers || {};
    }

    this.outputs = serverlessFile.outputs;

    this.initialServerlessConfig = serverlessFile;

    return this;
  }

  setFunctionNames(rawOptions) {
    const options = rawOptions || {};
    options.stage = options.stage || options.s;
    options.region = options.region || options.r;

    // setup function.name property
    const stageNameForFunction = options.stage || this.provider.stage;
    Object.entries(this.functions).forEach(([functionName, functionObj]) => {
      if (!functionObj.events) {
        this.functions[functionName].events = [];
      }

      if (!functionObj.name) {
        this.functions[
          functionName
        ].name = `${this.service}-${stageNameForFunction}-${functionName}`;
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
    const userConfig = this.initialServerlessConfig;
    userConfig.service = this.serviceObject;

    // Ensure to validate normalized (after mergeArrays) input
    if (userConfig.functions) userConfig.functions = this.functions;
    if (userConfig.resources) userConfig.resources = this.resources;

    this.serverless.configSchemaHandler.validateConfig(userConfig);

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
    return this.getAllFunctions().map(func => this.getFunction(func).name);
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
    const event = this.getFunction(functionName).events.find(e => Object.keys(e)[0] === eventName);
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
