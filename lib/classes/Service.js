'use strict';

const ServerlessError = require('./Error').ServerlessError;
const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const semver = require('semver');

class Service {

  constructor(serverless, data) {
    this.serverless = serverless;

    // Default properties
    this.service = null;
    this.provider = {
      stage: 'dev',
      region: 'us-east-1',
      variableSyntax: '\\${([ :a-zA-Z0-9._,\\-\\/\\(\\)]+?)}',
    };
    this.custom = {};
    this.plugins = [];
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
    const servicePath = that.serverless.config.servicePath;

    // skip if the service path is not found
    // because the user might be creating a new service
    if (!servicePath) {
      return BbPromise.resolve();
    }

    let serverlessYmlPath = path.join(servicePath, 'serverless.yml');
    // change to serverless.yaml if the file could not be found
    if (!this.serverless.utils.fileExistsSync(serverlessYmlPath)) {
      serverlessYmlPath = path
        .join(this.serverless.config.servicePath, 'serverless.yaml');
    }

    return that.serverless.yamlParser
      .parse(serverlessYmlPath)
      .then((serverlessFileParam) => {
        const serverlessFile = serverlessFileParam;
        // basic service level validation
        const version = this.serverless.utils.getVersion();
        const ymlVersion = serverlessFile.frameworkVersion;
        if (ymlVersion && !semver.satisfies(version, ymlVersion)) {
          const errorMessage = [
            `The Serverless version (${version}) does not satisfy the`,
            ` "frameworkVersion" (${ymlVersion}) in serverless.yml`,
          ].join('');
          throw new ServerlessError(errorMessage);
        }
        if (!serverlessFile.service) {
          throw new ServerlessError('"service" property is missing in serverless.yml');
        }
        if (!serverlessFile.provider) {
          throw new ServerlessError('"provider" property is missing in serverless.yml');
        }

        if (typeof serverlessFile.provider !== 'object') {
          const providerName = serverlessFile.provider;
          serverlessFile.provider = {
            name: providerName,
          };
        }

        const providers = ['aws', 'azure', 'google', 'openwhisk'];
        if (providers.indexOf(serverlessFile.provider.name) === -1) {
          const errorMessage = [
            `Provider "${serverlessFile.provider.name}" is not supported.`,
            ` Valid values for provider are: ${providers.join(', ')}.`,
            ' Please provide one of those values to the "provider" property in serverless.yml.',
          ].join('');
          throw new ServerlessError(errorMessage);
        }

        if (Array.isArray(serverlessFile.resources)) {
          serverlessFile.resources = serverlessFile.resources.reduce((memo, value) =>
            Object.assign(memo, value)
          , {});
        }

        that.service = serverlessFile.service;
        that.custom = serverlessFile.custom;
        that.plugins = serverlessFile.plugins;
        that.resources = serverlessFile.resources;
        that.functions = serverlessFile.functions || {};

        // merge so that the default settings are still in place and
        // won't be overwritten
        that.provider = _.merge(that.provider, serverlessFile.provider);

        if (serverlessFile.package) {
          that.package.individually = serverlessFile.package.individually;
          that.package.artifact = serverlessFile.package.artifact;
          that.package.exclude = serverlessFile.package.exclude;
          that.package.include = serverlessFile.package.include;
        }

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

        return this;
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
    if (eventName in this.getFunction(functionName).events) {
      return this.getFunction(functionName).events[eventName];
    }
    throw new ServerlessError(`Event "${eventName}" doesn't exist in function "${functionName}"`);
  }

  getAllEventsInFunction(functionName) {
    return Object.keys(this.getFunction(functionName).events);
  }
}

module.exports = Service;
