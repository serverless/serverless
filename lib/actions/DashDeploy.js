'use strict';

/**
 * Action: Dash Deploy
 * - Deploys Function Code & Endpoints
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Event Properties:
 * - stage:             (String)  The stage to deploy to
 * - regions:           (Array)   The region(s) in the stage to deploy to
 * - paths:             (Array)   Array of function paths to deploy.  Format: 'users/show', 'users/create'
 * - aliasFunction:     (String)  Custom Lambda alias.
 * - all:               (Boolean) Indicates whether all Functions in the project should be deployed.
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

class Dash extends SPlugin {

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
    return 'serverless.core.' + Dash.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.S.addAction(this.dash.bind(this), {
      handler:       'dash',
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
        }, {
          option:      'all',
          shortcut:    'a',
          description: 'Optional - Select all Functions in your project for deployment'
        }
      ]
    });

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  dash(event) {

    let _this = this,
        evt   = {};

    // If CLI - parse options
    if (_this.S.cli) {

      // Options
      evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

      // Option - Non-interactive
      if (_this.S.cli.options.nonInteractive) _this.S._interactive = false

      // Function paths - They should all be params
      evt.paths  = _this.S.cli.params;
    }

    // If NO-CLI, add options
    if (event) evt = event;

    // Add defaults
    evt.stage               = evt.stage ? evt.stage : null;
    evt.regions             = evt.region ? [evt.region] : [];
    evt.paths               = evt.paths ? evt.paths : [];
    evt.all                 = evt.all ? true : false;
    evt.aliasFunction       = evt.aliasFunction ? evt.aliasFunction : null;
    evt.aliasEndpoint       = evt.aliasEndpoint ? evt.aliasEndpoint : null;
    evt.aliasRestApi        = evt.aliasRestApi ? evt.aliasRestApi : null;
    evt.functions           = [];
    evt.endpoints           = [];
    evt.deployedFunctions   = {};
    evt.deployedEndpoints   = {};

    // Delete region for neatness
    if (evt.region) delete evt.region;

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
        .then(function(evt) {
          return _this.cliPromptSelectStage('Choose a stage: ', evt.stage, false)
              .then(stage => {
                evt.stage = stage;
                return evt;
              })
        })
        .then(_this._prepareRegions)
        .then(_this._processDeployment)
        .then(function(evt) {
          return evt;
        });

  }

  /**
   * Validate And Prepare
   * - If CLI, maps CLI input to event object
   */

  _validateAndPrepare() {

    let _this = this;

    if (!_this.S.cli) {

      // Validate Paths
      if (!evt.paths.length && !evt.all) {
        throw new SError(`One or multiple paths are required`);
      }

      // Validate Stage
      if (!evt.stage) {
        throw new SError(`Stage is required`);
      }
    }

    return BbPromise.resolve(_this.evt);
  }

  /**
   * Prepare Functions
   */

  _prepareFunctions(evt) {

    let _this = this;

    // If NO-CLI - Get Functions from submitted paths
    if (!_this.S.cli) {

      return SUtils.getFunctions(
          _this.S._projectRootPath,
          evt.all ? null : evt.paths)
          .then(function (functions) {

            evt.functions = functions;
            // Delete Paths
            if (evt.paths) delete evt.paths;
            return evt;
          });
    }

    // IF CLI + ALL/paths, get functions
    if (_this.S.cli && (evt.all || evt.paths.length)) {

      return SUtils.getFunctions(
          _this.S._projectRootPath,
          evt.all ? null : evt.paths)
          .then(function (functions) {

            if (!functions.length) throw new SError(`No functions found`);
            evt.functions = functions;
            // Delete Paths
            if (evt.paths) delete evt.paths;
            return evt;
          });
    }

    return evt;

  }


  /**
   * Prepare Endpoints
   */

  _prepareEndpoints(evt) {

    let _this = this;

    // If NO-CLI - Get Endpoints from submitted paths
    if (!_this.S.cli) {

      return SUtils.getEndpoints(
          _this.S._projectRootPath,
          evt.all ? null : evt.paths)
          .then(function (endpoints) {

            evt.endpoints = endpoints;
            // Delete Paths
            if (evt.paths) delete evt.paths;
            return evt;
          });
    }

    // IF CLI + ALL/paths, get endpoints
    if (_this.S.cli && (evt.all || evt.paths.length)) {

      return SUtils.getEndpoints(
          _this.S._projectRootPath,
          evt.all ? null : evt.paths)
          .then(function (endpoints) {

            if (!endpoints.length) throw new SError(`No endpoints found`);
            evt.endpoints = endpoints;

            // Delete Paths
            if (evt.paths) delete evt.paths;
            return evt;
          });
    }

    return evt;

  }

  /**
   * Prepare Endpoints
   */

  _prompt(evt) {

    let _this = this;

    if (_this.S.cli && !evt.all && !evt.paths.length) {

      // If not interactive, throw error
      if (!this.S._interactive) {
        return BbPromise.reject(new SError('Sorry, this is only available in interactive mode'));
      }

      // Get Functions
      return SUtils.getFunctions(process.cwd(), null)
          .then(function(functions) {

            return SUtils.getEndpoints(process.cwd(), null)
                .then(function (endpoints) {
                  return [functions, endpoints];
                });
          })
          .spread(function(functions, endpoints) {

            // If no functions & endpoints found, return
            if (!functions.length && !endpoints.length) return [];

            let functionsAndEndpoints = [];

            functions.forEach(function(func){
              let obj = {
                obj: func,
                type: "function",
                moduleFunction: func.module.name + ' - ' + func.name
              };

              functionsAndEndpoints.push(obj);
            });

            endpoints.forEach(function(endpoint){
              let obj = {
                obj: endpoint,
                type: "endpoint",
                moduleFunction: endpoint.module.name + ' - ' + endpoint.function.name
              };

              functionsAndEndpoints.push(obj);
            });

            // Prepare endpoints choices
            let choices = [];
            for (let i = 0; i < functionsAndEndpoints.length; i++) {

              let label = 'function';
              // if endpoint, change label
              if (functionsAndEndpoints[i].type === "endpoint") {
                label = 'endpoint - ' + functionsAndEndpoints[i].obj.path + ' - ' + functionsAndEndpoints[i].obj.method;
              }

              choices.push({
                key:        '  ',
                value:      functionsAndEndpoints[i],
                label:      label
              });
            }

            choices.sort(function(a,b) {
              if (a.value.moduleFunction < b.value.moduleFunction) return -1;
              if (a.value.moduleFunction > b.value.moduleFunction) return 1;
              return 0;
            });

            // Add spacers between modules
            let last;
            for (let i = 0; i < choices.length; i++) {
              let functionName;

              if (choices[i].value.type === "function") functionName = choices[i].value.obj.name;
              if (choices[i].value.type === "endpoint") functionName = choices[i].value.obj.function.name;

              let current = choices[i].value.moduleFunction;

              if (current !== last) {
                last = current;
                choices.splice(i, 0, { spacer: current });
              }
            }

            // Show select input
            return _this.cliPromptSelect('Select the functions and endpoints you wish to deploy', choices, true, 'Deploy')
                .then(function(selected) {

                  let selectedItems = [];
                  for (let i = 0; i < selected.length; i++) {
                    if (selected[i].toggled) selectedItems.push(selected[i].value);
                  }

                  return selectedItems;
                });
          })
          .then(function (selected) {
            selected.forEach(function(item){
              if(item.type === "function") evt.functions.push(item.obj);
              if(item.type === "endpoint") evt.endpoints.push(item.obj);
            });

            return evt;
          });
    }
    return evt;
  }

  /**
   * Prepare Regions
   */

  _prepareRegions(evt) {

    // If no region specified, deploy to all regions in stage
    if (!evt.regions.length) {
      evt.regions  = this.S._projectJson.stages[evt.stage].map(rCfg => {
        return rCfg.region;
      });
    }

    return evt;
  }

  /**
   * Process Deployment
   */

  _processDeployment(evt) {

    let _this = this;

    // Status
    SCli.log('Deploying functions/endpoints in "' + evt.stage + '" to the following regions: ' + evt.regions);
    _this._spinner = SCli.spinner();
    _this._spinner.start();

    return BbPromise.try(function() {
          return evt.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Add Deployed Region
          evt.deployedFunctions[region] = [];
          evt.deployedEndpoints[region] = [];

          // Deploy Function Code in each region
          return _this._deployCodeByRegion(evt, region)
              .then(function(){
                return _this._deployEndpointsByRegion(evt, region)
              });
        })
        .then(function() {

          // Status
          _this._spinner.stop(true);
          SCli.log('Successfully deployed functions/endpoints in "' + evt.stage + '" to the following regions: ' + evt.regions);
          // Display Methods & URLS
          for (let i = 0; i < Object.keys(evt.deployedEndpoints).length; i++) {
            let region = evt.deployedEndpoints[Object.keys(evt.deployedEndpoints)[i]];
            SCli.log(Object.keys(evt.deployedEndpoints)[i] + ' ------------------------');
            for (let j = 0; j < region.length; j++) {
              SCli.log('  ' + region[j].method + ' - ' + region[j].url);
            }
          }
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
          function: func,
        };

        // Process sub-Actions
        return _this.S.actions.codePackageLambdaNodejs(evtClone)
            .bind(_this)
            .then(_this.S.actions.codeDeployLambdaNodejs)
            .then(function(evtCloneProcessed) {

              // Add Function and Region
              evt.deployedFunctions[region].push(evtCloneProcessed.function);
              return cb();
            })
            .catch(function(e) {

              // Stash Failed Function Code
              if (!evt.failed) evt.failed = {};
              if (!evt.failed[region]) evt.failed[region] = [];
              evt.failed[region].push({
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

    let _this = this,
        regionConfig = SUtils.getRegionConfig(
            _this.S._projectJson,
            evt.stage,
            region);

    // Load AWS Service Instance for APIGateway
    let awsConfig    = {
      region:          region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };
    let ApiGateway   = require('../utils/aws/ApiGateway')(awsConfig);

    // Get or Create REST API for Region
    return ApiGateway.sFindOrCreateRestApi(
        _this.S,
        evt.stage,
        region)
        .then(function(restApi) {

          return new BbPromise(function(resolve, reject) {

            // A function can have multiple endpoints.  Process all endpoints for this Function
            async.eachSeries(evt.endpoints, function(endpoint, eCb) {

              // Create new event object
              let evtClone = {
                stage:          evt.stage,
                region:         regionConfig,
                endpoint:       endpoint,
                aliasEndpoint:  evt.aliasEndpoint,
                aliasRestApi:   evt.aliasRestApi,
              };

              return _this.S.actions.endpointBuildApiGateway(evtClone)
                  .then(function (evtProcessed) {
                    // Add provisioned endpoint urls
                    evt.deployedEndpoints[region].push({
                      function: evtProcessed.endpoint.function.name,
                      method:   evtProcessed.endpoint.method,
                      url:      evtProcessed.endpoint.url
                    });

                    return eCb();
                  })
                  .catch(function(e) {

                    // Stash Failed Endpoint
                    if (!evt.failed) evt.failed = {};
                    if (!evt.failed[region]) evt.failed[region] = [];
                    evt.failed[region].push({
                      message:  e.message,
                      stack:    e.stack,
                      endpoint: endpoint
                    });

                    return eCb();
                  });

            }, function() {
              return resolve(evt);
            });
          })
              .then(function(evt) {

                // Deploy API Gateway Deployment in region

                let newEvent = {
                  stage:  evt.stage,
                  region: regionConfig
                };

                return _this.S.actions.endpointDeployApiGateway(newEvent);
              });
        });
  }
}

module.exports = Dash;
