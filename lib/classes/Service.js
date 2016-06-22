'use strict';

const SError = require('./Error').SError;
const path = require('path');
const _ = require('lodash');
const traverse = require('traverse');
const replaceall = require('replaceall');
const BbPromise = require('bluebird');

class Service {

  constructor(serverless, data) {
    this.serverless = serverless;

    // Default properties
    this.service = null;
    this.provider = null;
    this.defaults = {
      stage: 'dev',
      region: 'us-east-1',
    };
    this.variableSyntax = null;
    this.custom = {};
    this.plugins = [];
    this.functions = {};
    this.environment = {};
    this.resources = {};

    if (data) this.update(data);
  }

  load(opts) {
    const that = this;
    const options = opts || {};
    const servicePath = that.serverless.config.servicePath;

    // skip if the service path is not found
    // because the user might be creating a new service
    if (!servicePath) {
      return BbPromise.resolve();
    }

    return that.serverless.yamlParser
      .parse(path.join(servicePath, 'serverless.yaml'))
      .then((serverlessYaml) => {
        // basic service level validation
        if (!serverlessYaml.service) {
          throw new SError('"service" property is missing in serverless.yaml');
        }
        if (!serverlessYaml.provider) {
          throw new SError('"provider" property is missing in serverless.yaml');
        }
        if (!serverlessYaml.functions) {
          throw new SError('"functions" property is missing in serverless.yaml');
        }

        that.service = serverlessYaml.service;
        that.provider = serverlessYaml.provider;
        that.variableSyntax = serverlessYaml.variableSyntax;
        that.custom = serverlessYaml.custom;
        that.plugins = serverlessYaml.plugins;
        that.resources = serverlessYaml.resources;
        that.functions = serverlessYaml.functions;

        if (serverlessYaml.defaults && serverlessYaml.defaults.stage) {
          this.defaults.stage = serverlessYaml.defaults.stage;
        }
        if (serverlessYaml.defaults && serverlessYaml.defaults.region) {
          this.defaults.region = serverlessYaml.defaults.region;
        }
      })
      .then(() => that.serverless.yamlParser
        .parse(path.join(servicePath, 'serverless.env.yaml')))
      .then((serverlessEnvYaml) => {
        that.environment = serverlessEnvYaml;
        return BbPromise.resolve(that);
      })
      .then(() => {
        if (!options.stage) {
          options.stage = this.defaults.stage;
        }

        if (!options.region) {
          options.region = this.defaults.region;
        }

        // Validate: Check stage exists
        this.getStage(options.stage);

        // Validate: Check region exists in stage
        this.getRegionInStage(options.stage, options.region);

        let varTemplateSyntax = /\${([\s\S]+?)}/g;

        if (this.variableSyntax) {
          varTemplateSyntax = RegExp(this.variableSyntax, 'g');

          // temporally remove variable syntax from service otherwise it'll match
          this.variableSyntax = true;
        }

        const commonVars = this.getVariables();
        const stageVars = this.getVariables(options.stage);
        const regionVars = this.getVariables(options.stage, options.region);

        // temporally remove environment obj. Doesn't make sense to
        // populate environment (stages, regions, vars)
        const environment = _.cloneDeep(this.environment);
        this.environment = null;

        /*
         * we can't use an arrow function in this case cause that would
         * change the lexical scoping required by the traverse module
         */
        traverse(this).forEach(function (valParam) {
          const t = this;
          let val = valParam;

          // check if the current string is a variable
          if (typeof(val) === 'string' && val.match(varTemplateSyntax)) {
            // get all ${variable} in the string
            val.match(varTemplateSyntax).forEach((variableSyntax) => {
              const variableString = variableSyntax
                .replace(varTemplateSyntax, (match, varName) => varName.trim());

              const variableName = (variableString
                .split('.').length > 1) ? variableString
                .split('.')[0] : variableString;

              let value;

              /*
               * we will manipulate the value later
               * so we gotta clone otherwise we will
               * corrupt the passed-by-reference variables object
               */
              if (variableName in commonVars) {
                value = _.cloneDeep(commonVars[variableName]);
              }

              if (variableName in stageVars) {
                value = _.cloneDeep(stageVars[variableName]);
              }

              if (variableName in regionVars) {
                value = _.cloneDeep(regionVars[variableName]);
              }

              // Populate
              if (!value && !value !== '') {
                throw new that.serverless.classes
                  .Error(`Variable "${variableName}" doesn't exist in serverless.env.yaml.`);
              } else if (typeof value === 'string') {
                if (variableString.split('.').length > 1) {
                  throw new that.serverless.classes
                    .Error('Trying to access sub properties of a string variable');
                }
                // for string variables, we use replaceall in case the user
                // includes the variable as a substring (ie. "hello ${name}")
                val = replaceall(variableSyntax, value, val);
              } else {
                // populate objects recursively
                if (typeof value === 'object') {
                  const subProperties = variableString.split('.');
                  // remove first element. It's the variableName
                  subProperties.splice(0, 1);
                  subProperties.forEach(subProperty => {
                    if (!value[subProperty]) {
                      throw new that.serverless.classes
                        .Error(`Invalid sub property for variable "${variableName}"`);
                    }
                    value = value[subProperty];
                  });

                  if (typeof value === 'string') {
                    val = replaceall(variableSyntax, value, val);
                  } else {
                    if (val !== variableSyntax) {
                      throw new that.serverless.classes
                        .Error('Trying to populate non string variables into a string');
                    }
                    val = value;
                  }
                } else if (variableString.split('.').length > 1) {
                  throw new that.serverless.classes
                    .Error('Trying to access sub properties of a non-object variable');
                } else {
                  if (val !== variableSyntax) {
                    throw new that.serverless.classes
                      .Error('Trying to populate non string variables into a string');
                  }
                  val = value; // not string nor object
                }
              }
            });

            // Replace
            t.update(val);
          }
        });

        // put back environment that we temporally removed earlier
        this.environment = environment;

        // put back variable syntax if we removed it for processing
        if (this.variableSyntax) this.variableSyntax = varTemplateSyntax;

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
    throw new SError(`function ${functionName} doesn't exist in this Service`);
  }

  getEventInFunction(eventName, functionName) {
    if (eventName in this.getFunction(functionName).events) {
      return this.getFunction(functionName).events[eventName];
    }
    throw new SError(`event ${eventName} doesn't exist in function ${functionName}`);
  }

  getAllEventsInFunction(functionName) {
    return Object.keys(this.getFunction(functionName).events);
  }

  getStage(stageName) {
    if (stageName in this.environment.stages) {
      return this.environment.stages[stageName];
    }
    throw new SError(`stage ${stageName} doesn't exist in this Service`);
  }

  getAllStages() {
    return Object.keys(this.environment.stages);
  }

  getRegionInStage(stageName, regionName) {
    if (regionName in this.getStage(stageName).regions) {
      return this.getStage(stageName).regions[regionName];
    }
    throw new SError(`region ${regionName} doesn't exist in stage ${stageName}`);
  }

  getAllRegionsInStage(stageName) {
    return Object.keys(this.getStage(stageName).regions);
  }

  getVariables(stageName, regionName) {
    if (stageName && regionName) {
      return this.getRegionInStage(stageName, regionName).vars || {};
    } else if (stageName) {
      return this.getStage(stageName).vars || {};
    }
    return this.environment.vars || {};
  }
}

module.exports = Service;
