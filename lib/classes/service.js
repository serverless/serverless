'use strict';

const ServerlessError = require('../serverless-error');
const util = require('util');
const _ = require('lodash');
const semver = require('semver');
const { log } = require('@serverless/utils/log');
const resolveCliInput = require('../cli/resolve-input');
const currentVersion = require('../../package').version;
const isLocallyInstalled = require('../cli/is-locally-installed');

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

  async load(rawOptions) {
    const options = rawOptions || {};
    if (!options.stage && options.s) options.stage = options.s;
    if (!options.region && options.r) options.region = options.r;
    const serviceDir = this.serverless.serviceDir;

    // skip if the service path is not found
    // because the user might be creating a new service
    if (!serviceDir) return;

    try {
      this.loadServiceFileParam();
    } catch (error) {
      if (resolveCliInput().isHelpRequest) return;
      throw error;
    }
  }

  loadServiceFileParam() {
    // Not used internally, left set to not break plugins which depend on it
    // TOOD: Remove with next major
    this.serviceFilename = this.serverless.configurationFilename;

    const configurationInput = this.serverless.configurationInput;

    this.initialServerlessConfig = configurationInput;

    // TODO: Ideally below approach should be replaced at some point with:
    // 1. In "initialization" phase: Minimize reliance on service configuration
    //    to few core properties
    // 2. Before "run" phase: Validate and normalize (via AJV) `serverless.configurationInput`
    //    into `serverless.configuration`
    // 3. In "run" phase: Instead of relying on `serverless.service` rely on
    //    `serverless.configuration` internally

    // Below comments provide usage feedback helfpul for future refactor process.

    // ## Properties currently accessed at "initialization" phase

    this.disabledDeprecations = configurationInput.disabledDeprecations;
    this.deprecationNotificationMode = configurationInput.deprecationNotificationMode;

    // `provider` (`provder.name` by many plugin constructs, and few other core properties as
    //              `provider.stage` are read by dashboard plugin)
    if (!_.isObject(configurationInput.provider)) {
      const providerName = configurationInput.provider;
      this.provider = {
        name: providerName,
      };
    } else {
      this.provider = configurationInput.provider;
    }
    if (this.provider.stage == null) {
      this.provider.stage = 'dev';
    }

    // `service` (read by dashboard plugin)
    if (_.isObject(configurationInput.service)) {
      throw new ServerlessError(
        'Object notation for "service" property is not supported. Set "service" property directly with service name.',
        'SERVICE_OBJECT_NOTATION'
      );
    } else {
      this.serviceObject = { name: configurationInput.service };
      this.service = configurationInput.service;
    }

    // (dashboard plugin)
    this.app = configurationInput.app;
    this.org = configurationInput.org;

    this.plugins = configurationInput.plugins;

    // `package.path` is read by few core plugins at initialization
    if (configurationInput.package) {
      this.package = configurationInput.package;
    }

    // ## Properties accessed at "run" phase
    this.custom = configurationInput.custom; // (dashboard plugin)
    this.resources = configurationInput.resources;
    this.functions = configurationInput.functions || {};
    this.configValidationMode = configurationInput.configValidationMode || 'warn';
    if (this.provider.name === 'aws') {
      this.layers = configurationInput.layers || {};
    }
    this.outputs = configurationInput.outputs;

    // basic service level validation
    const version = this.serverless.utils.getVersion();
    let ymlVersion = configurationInput.frameworkVersion;
    if (ymlVersion && !semver.validRange(ymlVersion)) {
      if (configurationInput.configValidationMode === 'error') {
        throw new ServerlessError(
          'Configured "frameworkVersion" does not represent a valid semver version range.',
          'INVALID_FRAMEWORK_VERSION'
        );
      }
      log.warning(
        'Configured "frameworkVersion" does not represent a valid semver version range, version validation is skipped'
      );
      ymlVersion = null;
    }
    if (!isLocallyInstalled && !ymlVersion && !semver.parse(version).prerelease.length) {
      log.info(
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
        ` "frameworkVersion" (${ymlVersion}) in ${this.serverless.configurationFilename}`,
      ].join('');
      throw new ServerlessError(errorMessage, 'FRAMEWORK_VERSION_MISMATCH');
    }
    if (!configurationInput.service) {
      throw new ServerlessError(
        `"service" property is missing in ${this.serverless.configurationFilename}`,
        'SERVICE_NAME_MISSING'
      );
    }
    if (!configurationInput.provider) {
      throw new ServerlessError(
        `"provider" property is missing in ${this.serverless.configurationFilename}`,
        'PROVIDER_NAME_MISSING'
      );
    }
    if (!_.isObject(configurationInput.provider)) {
      // Schema uncoditionally expects `provider` to be an object.
      // Ideally if it's fixed at some point, and either we do not support string notation for
      // provider, or we support string by schema
      configurationInput.provider = this.provider;
    }

    return this;
  }

  reloadServiceFileParam() {
    const configurationInput = this.initialServerlessConfig;
    if (_.isObject(configurationInput.provider)) {
      this.provider = configurationInput.provider;
      if (this.provider.stage == null) this.provider.stage = 'dev';
    }
    if (configurationInput.package) {
      this.package = configurationInput.package;
    }
    this.custom = configurationInput.custom;
    this.resources = configurationInput.resources;
    this.functions = configurationInput.functions || {};
    this.configValidationMode = configurationInput.configValidationMode || 'warn';
    if (this.provider.name === 'aws') {
      this.layers = configurationInput.layers || {};
    }
    this.outputs = configurationInput.outputs;
  }

  setFunctionNames(rawOptions) {
    const options = rawOptions || {};
    options.stage = options.stage || options.s;
    options.region = options.region || options.r;

    // Ensure that function is an object and setup function.name property
    const stageNameForFunction = options.stage || this.provider.stage;

    if (!_.isObject(this.functions)) {
      throw new ServerlessError(
        `Unexpected "functions" configuration: Expected object received: ${util.inspect(
          this.functions
        )}`,
        'NON_OBJECT_FUNCTIONS_CONFIGURATION'
      );
    }
    Object.entries(this.functions).forEach(([functionName, functionObj]) => {
      if (functionObj == null) {
        delete this.functions[functionName];
        return;
      }
      if (!_.isObject(functionObj)) {
        throw new ServerlessError(
          `Unexpected "${functionName}" function configuration: Expected object received ${util.inspect(
            functionObj
          )})`,
          'NON_OBJECT_FUNCTION_CONFIGURATION_ERROR'
        );
      }
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
    ['resources', 'functions'].forEach((key) => {
      if (Array.isArray(this[key])) {
        this[key] = this[key].reduce((memo, value) => {
          if (value) {
            if (typeof value === 'object') {
              return _.merge(memo, value);
            }
            throw new ServerlessError(
              `Non-object value specified in ${key} array: ${value}`,
              'LEGACY_CONFIGURATION_PROPERTY_MERGE_INVALID_INPUT'
            );
          }

          return memo;
        }, {});
      }
    });
  }

  async validate() {
    const userConfig = this.initialServerlessConfig;

    // Ensure to validate normalized (after mergeArrays) input
    if (userConfig.functions) userConfig.functions = this.functions;
    if (userConfig.resources) userConfig.resources = this.resources;

    await this.serverless.configSchemaHandler.validateConfig(userConfig);

    if (userConfig.projectDir != null) {
      this.serverless._logDeprecation(
        'PROJECT_DIR',
        'The "projectDir" option is no longer used and is ignored. ' +
          'You can safely remove it from the configuration'
      );
    }
    if (userConfig.variablesResolutionMode != null) {
      this.serverless._logDeprecation(
        'VARIABLES_RESOLUTION_MODE',
        'Starting with v3.0, the "variablesResolutionMode" option is now useless. ' +
          'You can safely remove it from the configuration'
      );
    }
    if (userConfig.console != null) {
      this.serverless._logDeprecation(
        'CONSOLE_CONFIGURATION',
        'Starting with v3.24.0, the "console" option is no longer recognized. ' +
          'Please remove it from the configuration'
      );
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
    throw new ServerlessError(
      `Function "${functionName}" doesn't exist in this Service`,
      'FUNCTION_MISSING_IN_SERVICE'
    );
  }

  getLayer(layerName) {
    if (layerName in this.layers) {
      return this.layers[layerName];
    }
    throw new ServerlessError(
      `Layer "${layerName}" doesn't exist in this Service`,
      'LAYER_MISSING_IN_SERVICE'
    );
  }

  getEventInFunction(eventName, functionName) {
    const event = this.getFunction(functionName).events.find(
      (e) => Object.keys(e)[0] === eventName
    );
    if (event) {
      return event;
    }
    throw new ServerlessError(
      `Event "${eventName}" doesn't exist in function "${functionName}"`,
      'EVENT_MISSING_FOR_FUNCTION'
    );
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
