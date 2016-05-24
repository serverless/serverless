'use strict';

const SError = require('./Error');
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

    if (!servicePath) {
      throw new Error('ServicePath is not configured.');
    }

    return that.serverless.yamlParser
      .parse(path.join(servicePath, 'serverless.yaml'))
      .then((serverlessYaml) => {
        that.service = serverlessYaml.service;
        that.variableSyntax = serverlessYaml.variableSyntax;
        that.custom = serverlessYaml.custom;
        that.plugins = serverlessYaml.plugins;
        that.resources = serverlessYaml.resources;
        that.functions = serverlessYaml.functions;
      })
      .then(() => that.serverless.yamlParser
        .parse(path.join(servicePath, 'serverless.env.yaml')))
      .then((serverlessEnvYaml) => {
        that.environment = serverlessEnvYaml;
        BbPromise.resolve(that);
      })
      .then(() => {
        // Validate: Check stage exists
        if (options.stage) this.getStage(options.stage);

        // Validate: Check region exists in stage
        if (options.region) this.getRegionInStage(options.stage, options.region);

        let varTemplateSyntax = /\${([\s\S]+?)}/g;

        if (this.variableSyntax) {
          varTemplateSyntax = RegExp(this.variableSyntax, 'g');

          // temporally remove variable syntax from service otherwise it'll match
          this.variableSyntax = true;
        }

        const variablesObject = this.getVariables(options.stage, options.region);


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
              const variableName = variableSyntax
                .replace(varTemplateSyntax, (match, varName) => varName.trim());
              let value;

              if (variableName in variablesObject) {
                value = variablesObject[variableName];
              }
              // Populate
              if (!value && !value !== '') {
                // SCLI.log('WARNING: This variable is not defined: ' + variableName);
              } else if (typeof value === 'string') {
                // for string variables, we use replaceall in case the user
                // includes the variable as a substring (ie. "hello ${name}")
                val = replaceall(variableSyntax, value, val);
              } else {
                val = value;
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
      return this.getRegionInStage(stageName, regionName).vars;
    } else if (stageName) {
      return this.getStage(stageName).vars;
    }
    return this.environment.vars;
  }
}

module.exports = Service;
