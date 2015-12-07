'use strict';

/**
 * Action: Function Deploy
 * - Deploys both Function Code and Function Endpoints
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Event Properties:
 * - type:              (String)  Either "code", "endpoint" or "both".  The type of Function Deploy.
 * - stage:             (String)  The stage to deploy to
 * - regions:           (Array)   The region(s) in the stage to deploy to
 * - noExeCf:           (Boolean) Don't execute CloudFormation
 * - paths:             (Array)   Array of function paths to deploy.  Format: 'users/show', 'users/create'
 * - aliasEndpoint:     (String)  The Lambda Alias the endpoint should point to.
 * - aliasFunction:     (String)  Custom Lambda alias.
 * - all:               (Boolean) Indicates whether all Functions in the project should be deployed.
 * - functions:         (Array)   Array of function JSONs from fun.sl.json
 * - deployed: (Object)  Contains regions and the code functions that have been uploaded to the S3 bucket in that region
 */

const SPlugin    = require('../ServerlessPlugin'),
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

class FunctionDeploy extends SPlugin {

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
    return 'serverless.core.' + FunctionDeploy.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.S.addAction(this.functionDeploy.bind(this), {
      handler:       'functionDeploy',
      description:   'Deploys the code or endpoint of a function, or both',
      context:       'function',
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
          option:      'aliasEndpoint', // TODO: Implement
          shortcut:    'ae',
          description: 'Optional - Point Endpoint(s) to a specific Lambda alias'
        }, {
          option:      'aliasFunction', // TODO: Implement
          shortcut:    'af',
          description: 'Optional - Provide a custom Alias to your Functions'
        }, {
          option:      'aliasApi', // TODO: Implement
          shortcut:    'aa',
          description: 'Optional - Override the API Gateway "functionAlias" Stage Variable'
        }, {
          option:      'all',
          shortcut:    'a',
          description: 'Optional - Select all Functions in your project for deployment'
        }
      ],
    });

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  functionDeploy(event) {

    let _this               = this;
    let evt                 = {};
    evt.type                = event.type ? event.type : null;
    evt.stage               = event.stage ? event.stage : null;
    evt.regions             = event.region ? [event.region] : [];
    evt.paths               = event.paths ? event.paths : [];
    evt.all                 = event.all ? event.all : null;
    evt.aliasEndpoint       = event.aliasEndpoint ? event.aliasEndpoint : null;
    evt.aliasFunction       = event.aliasFunction ? event.aliasFunction : null;
    evt.functions           = [];
    evt.deployed            = {};
    evt.failed              = {};

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._promptStage)
        .then(_this._processDeployment)
        .then(function(evt) {
          return evt;
        });
  }

  /**
   * Validate And Prepare
   * - If CLI, maps CLI input to event object
   */

  _validateAndPrepare(evt) {

    let _this = this;

    // If CLI, parse command line input and validate
    if (_this.S.cli) {

      // Add Options
      evt        = _this.S.cli.options;

      // Add type.  Should be first in array
      evt.type   = _this.S.cli.params[0];

      // Add function paths.   Should be all other array items
      _this.S.cli.params.splice(0,1);
      evt.paths  = _this.S.cli.params;
    }

    // If NO-CLI, validate
    if (!_this.S.cli) {

      // Check if paths or all is not used
      if (!evt.paths.length && !evt.all) {
        throw new SError(`One or multiple paths are required`);
      }
    }

    // Validate type
    if (!evt.type ||
        (evt.type !== 'code' &&
        evt.type  !== 'endpoint' &&
        evt.type  !== 'both')) {
      throw new SError(`Invalid type.  Must be "code", "endpoint", or "both" `);
    }

    // Validate stage
    if (!evt.stage) {
      throw new SError(`Stage is required`);
    }

    // If no region specified, deploy to all regions in stage
    if (!evt.regions.length) {
      evt.regions  = _this.S._projectJson.stages[evt.stage].map(rCfg => {
        return rCfg.region;
      });
    }

    SUtils.sDebug('Queued regions: ' + evt.regions);

    // If CLI and paths are missing, get paths from CWD, and return
    if (_this.S.cli) {
      if (!evt.paths || !evt.paths.length) {

        // If CLI and no paths, get full paths from CWD
        return SUtils.getFunctions(
            evt.all ? _this.S._projectRootPath : process.cwd(),
            null)
            .then(function(functions) {

              if (!functions.length) throw new SError(`No functions found`);

              evt.functions = functions;
              return evt;
            });
      }
    }

    // Otherwise, resolve full paths
    return SUtils.getFunctions(
        _this.S._projectRootPath,
        evt.all ? null : evt.paths)
        .then(function(functions) {
          evt.functions = functions;
          return evt;
        });
  }

  /**
   * Prompt Stage
   */

  _promptStage(evt) {

    let _this  = this,
        stages = [];

    if (!evt.stage) {

      stages = Object.keys(_this.S._projectJson.stage);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) evt.stage = stages[0];

    } else {

      // If user provided stage, skip prompt
      return BbPromise.resolve(evt);
    }

    // Create Choices
    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key:   '',
        value: stages[i],
        label: stages[i],
      });
    }

    // Show prompt
    return _this.selectInput('Function Deployer - Choose a stage: ', choices, false)
        .then(results => {
          evt.stage = results[0].value;
          return evt;
        });
  }

  /**
   * Process Deployment
   */

  _processDeployment(evt) {

    let _this = this;

    return BbPromise.try(function() {
          return evt.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Add Deployed & Failed Region
          evt.deployed[region] = {
            functions: [],
            endpoints: [],
          };
          evt.failed[region] = {
            functions: [],
            endpoints: [],
          };

          //Deploy Function Code in each region

          if (['code', 'both'].indexOf(evt.type) > -1) {
            return _this._deployCodeByRegion(evt, region);
          }
        })
        .then(function() {
          return evt.regions;
        })
        .each(function(region) {

          /**
           * Deploy Function Endpoints in each region
           */

          if (['endpoint', 'both'].indexOf(evt.type) > -1) {
            return _this._deployEndpointsByRegion(evt, region)
          }
        })
        .then(function() {
          return evt;
        });
  }

  /**
   * Deploy Code By Region
   */

  _deployCodeByRegion(evt, region) {

    let _this = this;

    return new BbPromise(function(resolve, reject) {

      /**
       *  Package, Upload, Deploy, Alias functions' code concurrently
       *  - Package must be redone for each region because ENV vars and IAM Roles are set for each region
       */

      async.eachLimit(evt.functions, 5, function(func, cb) {

        // Create new evt object for concurrent operations
        let evtClone = {
          stage: evt.stage,
          region: SUtils.getRegionConfig(
              _this.S._projectJson,
              evt.stage,
              region),
          function: func.path,
        };

        // Process sub-Actions
        return _this.S.actions.codePackageLambdaNodejs(evtClone)
            .bind(_this)
            .then(_this.S.actions.codeDeployLambdaNodejs)
            .then(function(evtCloneProcessed) {

              // Add Function and Region
              evt.deployed[region].functions.push(evtCloneProcessed.function);
              return cb();
            })
            .catch(function(e) {

              evt.failed[region].functions.push({
                message:  e.message,
                stack:    e.stack,
                function: func.path,
              });
              return cb();
            })

      }, function() {
        return resolve(evt, region);
      });
    });
  }

  /**
   * Deploy Endpoints By Region
   * - Finds or creates a API Gateway in the region
   * - Deploys all function endpoints queued in a specific region
   */

  _deployEndpointsByRegion(evt, region) {

    let _this = this;

    return new BbPromise(function(resolveOne, reject) {

      // Loop through each function
      async.eachSeries(evt.functions, function (func, fCb) {

        let evtClone = {
          stage:          evt.stage,
          region:         SUtils.getRegionConfig(
              _this.S._projectJson,
              evt.stage,
              region),
          function:       func.path,
          aliasEndpoint:  evt.aliasEndpoint,
        };

        return _this.S.actions.endpointPrepareApiGateway(evtClone)
            .then(function (evtClone) {

              return new BbPromise(function (resolveTwo, reject) {

                // A function can have multiple endpoints.  Process all endpoints for this Function
                async.eachSeries(evtClone.endpoints, function (endpoint, eCb) {

                  // Set endpoint property
                  evtClone.endpoint = endpoint;

                  return _this.S.actions.endpointBuildApiGateway(evtClone)
                      .then(function (evtProcessed) {

                        // Add provisioned endpoint urls
                        evt.deployed[region].endpoints.push({
                          function: evtProcessed.function.name,
                          method:   evtProcessed.endpoint.Method,
                          url:      evtProcessed.url
                        });

                        return eCb();
                      })
                      .catch(function(e) {

                        // Stash Failed Endpoint
                        evt.failed[region].endpoints.push({
                          message:  e.message,
                          stack:    e.stack,
                          function: func.path,
                          endpoint: endpoint
                        });

                        return eCb();
                      });

                }, function () {
                  return resolveTwo();
                });
              }); // BbPromise

            })
            .then(fCb)
      }, function () {
        return resolveOne(evt);
      }); // async.eachSeries
    })
        .then(function(evt) {

          // Deploy API Gateway Deployment in region

          let newEvent = {
            stage:  evt.stage,
            region: SUtils.getRegionConfig(
                _this.S._projectJson,
                evt.stage,
                region)
          };

          return _this.S.actions.endpointDeployApiGateway(newEvent);
        })
  }
}

module.exports = FunctionDeploy;
