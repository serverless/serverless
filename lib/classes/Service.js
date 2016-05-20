'use strict';

const SError = require('./Error');
const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');
const traverse = require('traverse');
const replaceall = require('replaceall');

class Service {

  constructor(S, data) {
    this.S = S;

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

  load() {
    const that = this;

    const servicePath = that.S.instances.config.servicePath;

    if (!servicePath) {
      throw new Error('ServicePath is not configured.');
    }

    return that.S.instances.yamlParser
      .parse(path.join(servicePath, 'serverless.yaml'))
      .then((serverlessYaml) => {
        that.service = serverlessYaml.service;
        that.variableSyntax = serverlessYaml.variableSyntax;
        that.custom = serverlessYaml.custom;
        that.plugins = serverlessYaml.plugins;
        that.resources = serverlessYaml.resources;
        that.functions = serverlessYaml.functions;
      })
      .then(() => {
        that.S.instances.yamlParser.parse(path.join(servicePath, 'serverless.env.yaml'));
      })
      .then((serverlessEnvYaml) => {
        that.environment = serverlessEnvYaml;
        return BbPromise.resolve(that);
      });
  }

  getPopulated(opts) {
    const options = opts || {};
    const serviceClone = _.cloneDeep(this);

    // temporally remove environment obj. Doesn't make sense to
    // populate environment (stages, regions, vars)
    serviceClone.environment = null;

    // Validate: Check stage exists
    if (options.stage) this.getStage(options.stage);

    // Validate: Check region exists in stage
    if (options.region) this.getRegionInStage(options.stage, options.region);

    let varTemplateSyntax = /\${([\s\S]+?)}/g;

    if (this.variableSyntax) {
      varTemplateSyntax = RegExp(serviceClone.variableSyntax, 'g');

      // temporally remove variable syntax from service otherwise it'll match
      serviceClone.variableSyntax = null;
    }

    const variablesObject = this.getVariables(options.stage, options.region);

    /*
     * we can't use an arrow function in this case cause that would
     * change the lexical scoping required by the traverse module
     */
    traverse(serviceClone).forEach(function (valParam) {
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
    serviceClone.environment = this.environment;

    // put back variable syntax if we removed it for processing
    if (this.variableSyntax) serviceClone.variableSyntax = varTemplateSyntax;
    return serviceClone;
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
