'use strict';

const SError = require('./Error').SError;
const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');

class Service {

  constructor(serverless, data) {
    this.serverless = serverless;

    // Default properties
    this.service = null;
    this.provider = {};
    this.defaults = {
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
        if (!serverlessFile.service) {
          throw new SError('"service" property is missing in serverless.yml');
        }
        if (!serverlessFile.provider) {
          throw new SError('"provider" property is missing in serverless.yml');
        }
        if (!serverlessFile.functions) {
          throw new SError('"functions" property is missing in serverless.yml');
        }

        if (typeof serverlessFile.provider !== 'object') {
          const providerName = serverlessFile.provider;
          serverlessFile.provider = {
            name: providerName,
          };
        }

        if (['aws', 'azure', 'google', 'ibm'].indexOf(serverlessFile.provider.name)) {
          const errorMessage = [
            `Provider "${serverlessFile.provider.name}" is not supported.`,
            ' Valid values for provider are: aws, azure, google, ibm.',
            ' Please provide one of those values to the "provider" property in serverless.yml.',
          ].join('');
          throw new SError(errorMessage);
        }

        that.service = serverlessFile.service;
        that.provider = serverlessFile.provider;
        that.custom = serverlessFile.custom;
        that.plugins = serverlessFile.plugins;
        that.resources = serverlessFile.resources;
        that.functions = serverlessFile.functions;

        if (serverlessFile.package) {
          that.package.individually = serverlessFile.package.individually;
          that.package.artifact = serverlessFile.package.artifact;
          that.package.exclude = serverlessFile.package.exclude;
          that.package.include = serverlessFile.package.include;
        }

        if (serverlessFile.defaults && serverlessFile.defaults.stage) {
          this.defaults.stage = serverlessFile.defaults.stage;
        }
        if (serverlessFile.defaults && serverlessFile.defaults.region) {
          this.defaults.region = serverlessFile.defaults.region;
        }
        if (serverlessFile.defaults && serverlessFile.defaults.variableSyntax) {
          this.defaults.variableSyntax = serverlessFile.defaults.variableSyntax;
        }

        // load defaults property for backward compatibility
        if (serverlessFile.defaults) {
          const warningMessage = [
            'Deprecation Notice: the "defaults" property in serverless.yml',
            ' is deprecated. The "stage", "region" & "variableSyntax" properties',
            ' has been moved to the "provider" property instead. Please update',
            ' your serverless.yml file asap. For more info, you can check our docs.',
          ].join('');
          this.serverless.cli.log(warningMessage);

          if (serverlessFile.defaults.stage) {
            this.defaults.stage = serverlessFile.defaults.stage;
          }
          if (serverlessFile.defaults.region) {
            this.defaults.region = serverlessFile.defaults.region;
          }
          if (serverlessFile.defaults.variableSyntax) {
            this.defaults.variableSyntax = serverlessFile.defaults.variableSyntax;
          }
        }

        // if exists, move provider to defaults for backward compatibility
        if (serverlessFile.provider.stage) {
          this.defaults.stage = serverlessFile.provider.stage;
        }
        if (serverlessFile.provider.region) {
          this.defaults.region = serverlessFile.provider.region;
        }
        if (serverlessFile.provider.variableSyntax) {
          this.defaults.variableSyntax = serverlessFile.provider.variableSyntax;
        }

        // make sure provider obj is in sync with default for backward compatibility
        this.provider.stage = this.defaults.stage;
        this.provider.region = this.defaults.region;
        this.provider.variableSyntax = this.defaults.variableSyntax;

        // setup function.name property
        const stageNameForFunction = options.stage || this.provider.stage;
        _.forEach(that.functions, (functionObj, functionName) => {
          if (!functionObj.events) {
            that.functions[functionName].events = [];
          }
          if (!_.isArray(functionObj.events)) {
            throw new SError(`Events for "${functionName}" must be an array,` +
                             ` not an ${typeof functionObj.events}`);
          }

          if (!functionObj.name) {
            that.functions[functionName].name =
              `${that.service}-${stageNameForFunction}-${functionName}`;
          }
        });

        return this;
      });
  }

  update(data) {
    return _.merge(this, data);
  }

  getAllFunctions() {
    return Object.keys(this.functions);
  }

  getFunction(functionName) {
    if (functionName in this.functions) {
      return this.functions[functionName];
    }
    throw new SError(`Function "${functionName}" doesn't exist in this Service`);
  }

  getEventInFunction(eventName, functionName) {
    if (eventName in this.getFunction(functionName).events) {
      return this.getFunction(functionName).events[eventName];
    }
    throw new SError(`Event "${eventName}" doesn't exist in function "${functionName}"`);
  }

  getAllEventsInFunction(functionName) {
    return Object.keys(this.getFunction(functionName).events);
  }
}

module.exports = Service;
