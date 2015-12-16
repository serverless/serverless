'use strict';

/**
 * Action: DashDeploy Deploy
 * - Deploys Function Code & Endpoints
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Event Properties:
 * - stage:             (String)  The stage to deploy to
 * - regions:           (Array)   The region(s) in the stage to deploy to
 * - aliasFunction:     (String)  Custom Lambda alias.
 * - functions:         (Array)   Array of function JSONs from fun.sl.json
 * - deployed: (Object)  Contains regions and the code functions that have been uploaded to the S3 bucket in that region
 */

const SPlugin  = require('../ServerlessPlugin'),
    SError       = require('../ServerlessError'),
    SUtils       = require('../utils/index'),
    SCli         = require('../utils/cli'),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class DashDeploy extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'serverless.core.' + DashDeploy.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.S.addAction(this.dashDeploy.bind(this), {
      handler:       'dashDeploy',
      description:   'Serverless Dashboard - Deploys both code & endpoint',
      context:       'dash',
      contextAction: 'deploy',
      options:       [
        {
          option:      'stage',
          shortcut:    's',
          description: 'Optional if only one stage is defined in project'
        }, {
          option:      'region',
          shortcut:    'r',
          description: 'Optional - Target one region to deploy to'
        }, {
          option:      'aliasFunction', // TODO: Implement
          shortcut:    'f',
          description: 'Optional - Provide a custom Alias to your Functions'
        }, {
          option:      'aliasEndpoint', // TODO: Implement
          shortcut:    'e',
          description: 'Optional - Provide a custom Alias to your Endpoints'
        }, {
          option:      'aliasRestApi',  // TODO: Implement
          shortcut:    'r',
          description: 'Optional - Provide a custom Api Gateway Stage Variable for your REST API'
        }
      ]
    });

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  dashDeploy(event) {

    let _this = this,
        evt   = {};

    // If CLI - parse options
    if (_this.S.cli) {

      // Options
      evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
    }

    // If NO-CLI, add options
    if (event) evt = event;

    // Add defaults
    evt.stage               = evt.stage ? evt.stage : null;
    evt.aliasFunction       = evt.aliasFunction ? evt.aliasFunction : null;
    evt.aliasEndpoint       = evt.aliasEndpoint ? evt.aliasEndpoint : null;
    evt.aliasRestApi        = evt.aliasRestApi ? evt.aliasRestApi : null;
    evt.functionPaths       = [];
    evt.endpointPaths       = [];
    evt.deployedFunctions   = {};
    evt.deployedEndpoints   = {};

    _this.evt = evt;

    // Flow
    return BbPromise.try(function() {
          if (_this.S._interactive) {
            SCli.asciiGreeting();
          }
        })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._prepareFunctions)
        .then(_this._prepareEndpoints)
        .then(_this._prompt)
        .then(function() {
          return _this.cliPromptSelectStage('Choose a Stage: ', _this.evt.stage, false)
              .then(stage => {
                _this.evt.stage = stage;
              })
        })
        .then(function() {
          return _this.cliPromptSelectRegion('Choose a Region in this Stage: ', true, _this.evt.region, _this.evt.stage)
              .then(region => {
                _this.evt.region = region;
              })
        })
        .then(_this._deploy)
        .then(function() {
          return _this.evt;
        });
  }

  /**
   * Validate And Prepare
   * - If CLI, maps CLI input to event object
   */

  _validateAndPrepare() {

    let _this = this;

    // If not interactive, throw error
    if (!this.S._interactive) {
      return BbPromise.reject(new SError('Sorry, this is only available in interactive mode'));
    }

    return BbPromise.resolve(_this.evt);
  }

  /**
   * Prepare Functions
   */

  _prepareFunctions() {

    let _this = this;

    return SUtils.getFunctions(_this.S._projectRootPath, null)
        .then(function (functions) {
          _this.functions = functions;
        });
  }

  /**
   * Prepare Endpoints
   */

  _prepareEndpoints() {

    let _this = this;

    return SUtils.getEndpoints(_this.S._projectRootPath, null)
        .then(function (endpoints) {
          _this.endpoints = endpoints;
        });
  }

  /**
   * Prompt
   */

  _prompt() {

    let _this = this,
        data = {};

    // Loop through functions
    _this.functions.forEach(function(func){
      if (!data[func.module.name]) data[func.module.name] = {};
      if (!data[func.module.name][func.name]) data[func.module.name][func.name] = {
        function:  func,
        endpoints: []
      };
    });

    // Loop through endpoints
    _this.endpoints.forEach(function(endpoint){
      data[endpoint.module.name][endpoint.function.name].endpoints.push(endpoint);
    });

    // Prepare endpoints choices
    let choices    = [];
    for (let i = 0; i < Object.keys(data).length; i++) {

      let module = Object.keys(data)[i];

      for (let j = 0; j < Object.keys(data[module]).length; j++) {

        let func = data[module][Object.keys(data[module])[j]];

        // Push module name as spacer
        choices.push({
          spacer: module + ' - ' + func.function.name
        });

        // Create function path and add it as a choice
        let path = func.function.pathFunction.split('modules')[1];
        if (['/', '\\'].indexOf(path.charAt(0)) !== -1) {
          path = path.substring(1, path.length);
        }
        path = path + '#' + func.function.name;

        choices.push({
          key:        '  ',
          value:      path,
          label:      'function - ' + func.function.name,
          type:       'function'
        });

        // If no endpoints, skip iteration
        if (!func.endpoints || !func.endpoints.length) continue;

        // If endpoints, find them
        for (let k = 0; k < func.endpoints.length; k++) {
          choices.push({
            key:        '  ',
            value:      path + '@' + func.endpoints[k].path + '~' + func.endpoints[k].method,
            label:      'endpoint - ' + func.endpoints[k].path + ' - ' + func.endpoints[k].method,
            type:       'endpoint'
          });
        }
      }
    }

    // Show select input
    return _this.cliPromptSelect('Select the functions and endpoints you wish to deploy', choices, true, 'Deploy')
        .then(function(items) {
          // Retrieve only toggled items
          let selectedItems = [];
          for (let i = 0; i < items.length; i++) {
            if (items[i].toggled) {
              if(items[i].type === "function") _this.evt.functionPaths.push(items[i].value);
              if(items[i].type === "endpoint") _this.evt.endpointPaths.push(items[i].value);
            }
          }
        })
  }

  /**
   * Deploy
   */

  _deploy() {

    let _this = this;

    return new BbPromise(function(resolve, reject) {

      // If user selected functions, deploy them
      if (!_this.evt.functionPaths || !_this.evt.functionPaths.length) return resolve();

      return _this.S.actions.functionDeploy({
            stage: _this.evt.stage,
            region: _this.evt.region,
            paths: _this.evt.functionPaths
          })
          .then(function(evt) {
            _this.evt.deployedFunctions = evt.deployed;
            return resolve();
          });
    })
        .then(function() {

          // If user selected functions, deploy them
          if (!_this.evt.endpointPaths || !_this.evt.endpointPaths.length) return;

          return _this.S.actions.endpointDeploy({
                stage: _this.evt.stage,
                region: _this.evt.region,
                paths: _this.evt.endpointPaths
              })
              .then(function(evt) {
                _this.evt.deployedEndpoints = evt.deployed;
              });
        })
  }
}

module.exports = DashDeploy;
