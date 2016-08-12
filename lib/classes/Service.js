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
      variableSyntax: '\\${([a-zA-Z0-9._\\-\\/\\(\\)]+?)}',
    };
    this.custom = {};
    this.plugins = [];
    this.functions = {};
    this.environment = {};
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

        // setup function.name property
        _.forEach(that.functions, (functionObj, functionName) => {
          if (!functionObj.events) {
            that.functions[functionName].events = [];
          }

          if (!functionObj.name) {
            that.functions[functionName].name = `${that.service}-${options.stage}-${functionName}`;
          }
        });

        if (serverlessFile.package && serverlessFile.package.artifact) {
          that.package.artifact = serverlessFile.package.artifact;
        }
        if (serverlessFile.package && serverlessFile.package.exclude) {
          that.package.exclude = serverlessFile.package.exclude;
        }
        if (serverlessFile.package && serverlessFile.package.include) {
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

        // Moving defaults into provider obj
        if (serverlessFile.provider.stage) {
          this.defaults.stage = serverlessFile.provider.stage;
        }
        if (serverlessFile.provider.region) {
          this.defaults.region = serverlessFile.provider.region;
        }
        if (serverlessFile.provider.variableSyntax) {
          this.defaults.variableSyntax = serverlessFile.provider.variableSyntax;
        }

        return this;
      });
  }

  populate(processedOptions) {
    const that = this;
    const options = processedOptions || {};
    const variableSyntaxProperty = this.defaults.variableSyntax;
    const variableSyntax = RegExp(variableSyntaxProperty, 'g');
    const fileRefSyntax = RegExp(/^file\(([a-zA-Z0-9._\-\/]+?)\)/g);
    // const fileRefSyntax = RegExp('^file\\(([a-zA-Z0-9._\\-\\/]+?)\\)', 'g');

    // temporally remove variable syntax from service otherwise it'll match
    this.defaults.variableSyntax = true;
    this.serverless.service.defaults.variableSyntax = true;


    /*
     * we can't use an arrow function in this case cause that would
     * change the lexical scoping required by the traverse module
     */
    traverse(this).forEach(function (property) {
      const t = this;

      if (typeof property === 'string') {
        const nestedPopulate = (updatedPropertyParam) => {
          let updatedProperty = updatedPropertyParam;
          if (typeof updatedProperty === 'string' && updatedProperty.match(variableSyntax)) {
            updatedProperty.match(variableSyntax).forEach((matchedString) => {
              const variableString = matchedString
                .replace(variableSyntax, (match, varName) => varName.trim());

              /*
               * File Reference
               */
              if (variableString.match(fileRefSyntax)) {
                const matchedFileRefString = variableString.match(fileRefSyntax)[0];
                const referencedFileRelativePath = matchedFileRefString
                  .replace(fileRefSyntax, (match, varName) => varName.trim());
                const referencedFileFullPath = path.join(that.serverless.config.servicePath,
                  referencedFileRelativePath);

                let value = that.serverless.utils.readFileSync(referencedFileFullPath);
                if (matchedFileRefString !== variableString) {
                  let deepProperties = variableString
                    .replace(matchedFileRefString, '');
                  if (deepProperties.substring(0, 1) !== '.') {
                    const errorMessage = [
                      'Invalid variable syntax when referencing',
                      ` file "${referencedFileRelativePath}"`,
                      ' Please use valid dot notation when referencing sub properties.',
                    ].join('');
                    throw new that.serverless.classes
                      .Error(errorMessage);
                  }
                  deepProperties = deepProperties.slice(1);
                  const selfSubProperties = deepProperties.split('.');
                  selfSubProperties.forEach(selfSubProperty => {
                    if (!value[selfSubProperty]) {
                      const errorMessage = [
                        `file "${referencedFileRelativePath}" doesn't`,
                        ` have sub property "${selfSubProperty}".`,
                        ' Please make sure you are referencing the correct sub property',
                      ].join('');
                      throw new that.serverless.classes
                        .Error(errorMessage);
                    }
                    value = value[selfSubProperty];
                  });
                }

                if (typeof value === 'string') {
                  updatedProperty = replaceall(matchedString, value, updatedProperty);
                } else {
                  if (updatedProperty !== matchedString) {
                    const errorMessage = [
                      'Trying to populate non string value into',
                      ` a string when referencing file "${referencedFileRelativePath}".`,
                      ' Please make sure the value of the property',
                      '  is a string',
                    ].join('');
                    throw new that.serverless.classes
                      .Error(errorMessage);
                  }
                  updatedProperty = value;
                }
                /*
                 * Env Var Reference
                 */
              } else if (variableString.split('.')[0] === 'env') {
                if (variableString.split('.').length !== 2) {
                  const errorMessage = [
                    'Trying to access sub properties of environment',
                    ' variable strings, or trying to reference all environment variable.',
                  ].join('');
                  throw new SError(errorMessage);
                }
                const requestedEnvVar = variableString.split('.')[1];
                const propertyValue = process.env[requestedEnvVar];
                if (typeof propertyValue === 'undefined') {
                  const errorMessage = [
                    `Environment variable ${requestedEnvVar} is not set on your machine.`,
                    ' Please set this env var before referencing it as a variable.',
                  ].join('');
                  throw new SError(errorMessage);
                }
                updatedProperty = replaceall(matchedString, propertyValue, updatedProperty);

                /*
                 * Options Reference
                 */
              } else if (variableString.split('.')[0] === 'opt') {
                if (variableString.split('.').length === 1) {
                  // load all options object
                  if (updatedProperty === matchedString) {
                    updatedProperty = options;
                  } else {
                    const errorMessage = [
                      'Trying to reference all options object as a substring.',
                      ' Please make sure the string referencing the variable',
                      ' Does not contain any other sub-strings,',
                      ' or reference a specific option string.',
                    ].join('');
                    throw new SError(errorMessage);
                  }
                } else if (variableString.split('.').length === 2) {
                  // load specific option
                  const requestedOption = variableString.split('.')[1];
                  const propertyValue = options[requestedOption];
                  if (typeof propertyValue === 'undefined') {
                    const errorMessage = [
                      `Option ${requestedOption} was not passed in the CLI.`,
                      ' Please pass this variable in the CLI to use in serverless.yml.',
                    ].join('');
                    throw new SError(errorMessage);
                  }
                  updatedProperty = replaceall(matchedString, propertyValue, updatedProperty);
                } else {
                  const errorMessage = [
                    'Trying to reference a specific option sub properties.',
                    ' Each passed option can only be a string, not objects.',
                    ' Please make sure you only reference the option string',
                    ' without any other dot notation.',
                  ].join('');
                  throw new SError(errorMessage);
                }

                /*
                 * Self Reference
                 */
              } else if (variableString.split('.')[0] === 'self') {
                if (variableString.split('.').length === 1) {
                  const errorMessage = [
                    'You can\'t reference the entire "self" serverless.yml file.',
                    ' Please reference a sub property with ${self.subProp}',
                  ].join('');
                  throw new that.serverless.classes
                    .Error(errorMessage);
                }
                let value = _.cloneDeep(that);
                const selfSubProperties = variableString.split('.');
                // remove first element. It's the "self" keyword
                selfSubProperties.splice(0, 1);
                selfSubProperties.forEach(selfSubProperty => {
                  if (!value[selfSubProperty]) {
                    const errorMessage = [
                      `serverless.yml doesn't have sub property "${selfSubProperty}".`,
                      ' Please make sure you are referencing the correct sub property',
                    ].join('');
                    throw new that.serverless.classes
                      .Error(errorMessage);
                  }
                  value = value[selfSubProperty];
                });

                if (typeof value === 'string') {
                  updatedProperty = replaceall(matchedString, value, updatedProperty);
                } else {
                  if (updatedProperty !== matchedString) {
                    const errorMessage = [
                      'Trying to populate non string value into',
                      ' a string when referencing "self".',
                      ' Please make sure the value of the property',
                      '  is a string',
                    ].join('');
                    throw new that.serverless.classes
                      .Error(errorMessage);
                  }
                  updatedProperty = value;
                }
              } else {
                const errorMessage = [
                  `Invalid variable reference syntax for variable ${matchedString}.`,
                  ' You can only reference env vars, options, & files.',
                  ' You can check our docs for more info.',
                ].join('');
                throw new SError(errorMessage);
              }
            });

            return nestedPopulate(updatedProperty);
          }
          return updatedProperty;
        };
        const updatedProperty = nestedPopulate(property);
        t.update(updatedProperty);
      }
    });

    // put back variable syntax that we removed earlier
    this.defaults.variableSyntax = variableSyntaxProperty;
    this.serverless.service.defaults.variableSyntax = variableSyntaxProperty;
    return this;
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
