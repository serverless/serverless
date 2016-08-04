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
    this.provider = {};
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
    this.package = {};

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

    let serverlessYmlPath = path.join(servicePath, 'serverless.yml');
    // change to serverless.yaml if the file could not be found
    if (!this.serverless.utils.fileExistsSync(serverlessYmlPath)) {
      serverlessYmlPath = path
        .join(this.serverless.config.servicePath, 'serverless.yaml');
    }

    let serverlessEnvYmlPath = path.join(servicePath, 'serverless.env.yml');
    // change to serverless.env.yaml if the file could not be found
    if (!this.serverless.utils.fileExistsSync(serverlessEnvYmlPath)) {
      serverlessEnvYmlPath = path
        .join(this.serverless.config.servicePath, 'serverless.env.yaml');
    }

    return that.serverless.yamlParser
      .parse(serverlessYmlPath)
      .then((serverlessYmlParam) => {
        const serverlessYml = serverlessYmlParam;
        // basic service level validation
        if (!serverlessYml.service) {
          throw new SError('"service" property is missing in serverless.yml');
        }
        if (!serverlessYml.provider) {
          throw new SError('"provider" property is missing in serverless.yml');
        }
        if (!serverlessYml.functions) {
          throw new SError('"functions" property is missing in serverless.yml');
        }

        if (typeof serverlessYml.provider !== 'object') {
          const providerName = serverlessYml.provider;
          serverlessYml.provider = {
            name: providerName,
          };
        }

        if (['aws', 'azure', 'google', 'ibm'].indexOf(serverlessYml.provider.name)) {
          const errorMessage = [
            `Provider "${serverlessYml.provider.name}" is not supported.`,
            ' Valid values for provider are: aws, azure, google, ibm.',
            ' Please provide one of those values to the "provider" property in serverless.yml.',
          ].join('');
          throw new SError(errorMessage);
        }

        that.service = serverlessYml.service;
        that.provider = serverlessYml.provider;
        that.variableSyntax = serverlessYml.variableSyntax;
        that.custom = serverlessYml.custom;
        that.plugins = serverlessYml.plugins;
        that.resources = serverlessYml.resources;
        that.functions = serverlessYml.functions;

        _.forEach(that.functions, (functionObj, index) => {
          if (!functionObj.events) {
            that.functions[index].events = [];
          }
        });

        if (serverlessYml.package && serverlessYml.package.artifact) {
          that.package.artifact = serverlessYml.package.artifact;
        }
        if (serverlessYml.package && serverlessYml.package.exclude) {
          that.package.exclude = serverlessYml.package.exclude;
        }
        if (serverlessYml.package && serverlessYml.package.include) {
          that.package.include = serverlessYml.package.include;
        }

        if (serverlessYml.defaults && serverlessYml.defaults.stage) {
          this.defaults.stage = serverlessYml.defaults.stage;
        }
        if (serverlessYml.defaults && serverlessYml.defaults.region) {
          this.defaults.region = serverlessYml.defaults.region;
        }
      })
      .then(() => that.serverless.yamlParser
        .parse(serverlessEnvYmlPath))
      .then((serverlessEnvYmlParam) => {
        const serverlessEnvYml = serverlessEnvYmlParam;

        // safely load serverless.env.yml while avoiding
        // reference errors
        serverlessEnvYml.vars = serverlessEnvYml.vars || {};
        serverlessEnvYml.stages = serverlessEnvYml.stages || {};
        Object.keys(serverlessEnvYml.stages).forEach(stage => {
          serverlessEnvYml.stages[stage] = serverlessEnvYml.stages[stage] || {};
          serverlessEnvYml.stages[stage].vars = serverlessEnvYml.stages[stage].vars || {};
          serverlessEnvYml.stages[stage].regions = serverlessEnvYml.stages[stage].regions || {};
          Object.keys(serverlessEnvYml.stages[stage].regions).forEach(region => {
            serverlessEnvYml.stages[stage].regions[region] =
              serverlessEnvYml.stages[stage].regions[region] || {};
            serverlessEnvYml.stages[stage].regions[region].vars =
              serverlessEnvYml.stages[stage].regions[region].vars || {};
          });
        });

        that.environment = serverlessEnvYml;

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

        // setup function.name property
        _.forEach(that.functions, (functionObj, functionName) => {
          if (!functionObj.name) {
            that.functions[functionName].name = `${that.service}-${options.stage}-${functionName}`;
          }
        });

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
                const errorMessage = [
                  `Variable "${variableName}" doesn't exist in serverless.env.yml.`,
                  ' Please add it to serverless.env.yml.',
                ].join('');
                throw new that.serverless.classes
                  .Error(errorMessage);
              } else if (typeof value === 'string') {
                if (variableString.split('.').length > 1) {
                  const errorMessage = [
                    `Trying to access sub properties of a string variable "${variableName}".`,
                    ' Please make sure the variable in serverless.env.yml',
                    ' is an object, otherwise you cannot use the',
                    ' dot notation for that variable in serverless.yml',
                  ].join('');
                  throw new that.serverless.classes
                    .Error(errorMessage);
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
                      const errorMessage = [
                        `Variable "${variableName}" doesn't have sub property "${subProperty}".`,
                        ' Please make sure the variable is',
                        ' the intended object in serverless.env.yml,',
                        ' or reference the correct sub property in serverless.yml',
                      ].join('');
                      throw new that.serverless.classes
                        .Error(errorMessage);
                    }
                    value = value[subProperty];
                  });

                  if (typeof value === 'string') {
                    val = replaceall(variableSyntax, value, val);
                  } else {
                    if (val !== variableSyntax) {
                      const errorMessage = [
                        'Trying to populate non string variables into',
                        ` a string for variable "${variableName}".`,
                        ' Please make sure the variable value in',
                        '  serverless.env.yml is a string',
                      ].join('');
                      throw new that.serverless.classes
                        .Error(errorMessage);
                    }
                    val = value;
                  }
                } else if (variableString.split('.').length > 1) {
                  const errorMessage = [
                    `Trying to access sub properties of a non-object variable "${variableName}"`,
                    ' Please make sure the variable is an object in serverless.env.yml,',
                    ' otherwise, you cannot use the dot notation',
                    ' for that variable in serverless.yml',
                  ].join('');
                  throw new that.serverless.classes
                    .Error(errorMessage);
                } else {
                  if (val !== variableSyntax) {
                    const errorMessage = [
                      'Trying to populate non string variables',
                      ` into a string for variable "${variableName}".`,
                      ' Please make sure the variable value in serverless.env.yml is a string',
                    ].join('');
                    throw new that.serverless.classes
                      .Error(errorMessage);
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

  getStage(stageName) {
    if (stageName in this.environment.stages) {
      return this.environment.stages[stageName];
    }
    throw new SError(`Stage "${stageName}" doesn't exist in this service.`);
  }

  getAllStages() {
    return Object.keys(this.environment.stages);
  }

  getRegionInStage(stageName, regionName) {
    if (regionName in this.getStage(stageName).regions) {
      return this.getStage(stageName).regions[regionName];
    }
    throw new SError(`Region "${regionName}" doesn't exist in stage "${stageName}"`);
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
