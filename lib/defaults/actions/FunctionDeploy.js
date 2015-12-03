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
 * - endpointAlias:     (String)  The Lambda Alias the endpoint should point to.
 * - all:               (Boolean) Indicates whether all Functions in the project should be deployed.
 * - functions:         (Array)   Array of function JSONs from fun.sl.json
 * - functionsUploaded: (Object)  Contains regions and the code functions that have been uploaded to the S3 bucket in that region
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    JawsCli      = require('../../utils/cli'),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class FunctionDeploy extends JawsPlugin {

  /**
   * Constructor
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'jaws.core.' + FunctionDeploy.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.Jaws.addAction(this.functionDeploy.bind(this), {
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
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Optional - Don\'t execute CloudFormation, just generate it',
        }, {
          option:      'endpointAlias',
          shortcut:    'ea',
          description: 'Optional - Point endpoint to a Lambda with this specific alias'
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
    evt.queued              = {};
    evt.type                = event.type ? event.type : null;
    evt.stage               = event.stage ? event.stage : null;
    evt.regions             = event.region ? [event.region] : [];
    evt.noExeCf             = (event.noExeCf == true || event.noExeCf == 'true');
    evt.paths               = event.paths ? event.paths : [];
    evt.all                 = event.all ? event.all : null;
    evt.endpointAlias       = event.endpointAlias ? event.endpointAlias : null;
    evt.functions           = [];
    evt.functionsUploaded   = {};

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
    if (_this.Jaws.cli) {

      // Add Options
      evt = _this.Jaws.cli.options;

      // Add type.  Should be first in array
      evt.type   = _this.Jaws.cli.params[0];

      // Add function paths.   Should be all other array items
      _this.Jaws.cli.params.splice(0,1);
      evt.paths  = _this.Jaws.cli.params;
    }

    // If NO-CLI, validate
    if (!_this.Jaws.cli) {

      // Check if paths or all is not used
      if (!evt.paths.length && !evt.all) {
        throw new JawsError(`One or multiple paths are required`);
      }
    }

    // Validate type
    if (!evt.type ||
        (evt.type !== 'code' &&
        evt.type  !== 'endpoint' &&
        evt.type  !== 'both')) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "both" `);
    }

    // Validate stage
    if (!evt.stage) {
      throw new JawsError(`Stage is required`);
    }

    // If no region specified, deploy to all regions in stage
    if (!evt.regions.length) {
      evt.regions  = _this.Jaws._projectJson.stages[evt.stage].map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Queued regions: ' + evt.regions);

    // If CLI and paths are missing, get paths from CWD, and return
    if (_this.Jaws.cli) {
      if (!evt.paths || !evt.paths.length) {

        // If CLI and no paths, get full paths from CWD
        return JawsUtils.getFunctions(
            evt.all ? _this.Jaws._projectRootPath : process.cwd(),
            null)
            .then(function(functions) {

              if (!functions.length) throw new JawsError(`No functions found`);

              evt.functions = functions;
              return evt;
            });
      }
    }

    // Otherwise, resolve full paths
    return JawsUtils.getFunctions(
        _this.Jaws._projectRootPath,
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

      stages = Object.keys(_this.Jaws._projectJson.stage);

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

          // Prepare Function Code in each region
          if (['code', 'both'].indexOf(evt.type) > -1) {
            return _this._prepareCodeByRegion(evt, region);
          }
        })
        .then(function() {

          // Provision Function Code in all regions
          if (['code', 'both'].indexOf(evt.type) > -1) {
           return _this._deployCodeAllRegions(evt);
          }
        })
        .then(function() {
          return evt.regions;
        })
        .each(function(region) {

          // Prepare Endpoints in each region
          if (['endpoint', 'both'].indexOf(evt.type) > -1) {
            return _this._prepareEndpointByRegion(evt, region)
          }
        })
        .then(function() {

          // Provision Endpoints in all regions
          if (['endpoint', 'both'].indexOf(evt.type) > -1) {
            return _this._deployEndpointsAllRegions(evt);
          }
        })
        .then(function() {
          return evt;
        });
  }

  /**
   * Prepare Code By Region
   */

  _prepareCodeByRegion(evt, region) {
    let _this = this;

    return new BbPromise(function(resolve, reject) {

      // Create functionsUploaded array for this region
      evt.functionsUploaded[region] = [];

      // Package & Upload functions' code concurrently
      // Package must be redone for each region because ENV vars are set for each region
      async.eachLimit(evt.functions, 5, function(func, cb) {

        // Create new evt object for concurrent operations
        let evtClone = {
          stage: evt.stage,
          region: JawsUtils.getProjRegionConfigForStage(
              _this.Jaws._projectJson,
              evt.stage,
              region),
          path: func.path,
        };

        // TODO: Read runtime of func
        // TODO: Deploy by runtime

        // Process sub-Actions
        return _this.Jaws.actions.codePackageLambdaNodejs(evtClone)
            .bind(_this)
            .then(_this.Jaws.actions.codeCompressLambdaNodejs)
            .then(_this.Jaws.actions.codeUploadLambdaNodejs)
            .then(function(evtCloneProcessed) {

              // Add Function and Region
              evt.functionsUploaded[region].push(evtCloneProcessed.function);
              return cb();
            })
            .catch(function(e) {
              JawsCli.log('Error deploying function ' + evt.type + ':');
              console.log(e.stack);
            })
            .finally(cb);

      }, function() {
        return resolve(evt, region);
      });
    });
  }

  /**
   * Deploy Code All Regions
   * - Initiates CloudFormation Stack Create/Update in all Regions Concurrently
   */

  _deployCodeAllRegions(evt) {

    let _this = this;
    return new BbPromise(function(resolve, reject) {

      // If type is "endpoint", skip
      if (evt.type === 'endpoint') return resolve();

      // If type is "code" or "both", do concurrent, multi-region, CF update
      async.eachLimit(Object.keys(evt.functionsUploaded), 5, function(region, cb) {

        let newEvent = {
          stage: evt.stage,
          region: JawsUtils.getProjRegionConfigForStage(
              _this.Jaws._projectJson,
              evt.stage,
              region),
          functions: evt.functionsUploaded[region],
        };

        return _this.Jaws.actions.codeProvisionLambdaNodejs(newEvent)
            .then(cb);

      }, function() {
        return resolve(evt);
      });
    });
  }

  /**
   * Prepare Endpoint By Region
   * - Finds or creates a API Gateway in the region
   * - Deploys all function endpoints queued in a specific region
   */

  _prepareEndpointByRegion(evt, region) {

    let _this = this;

    // Load AWS Service Instance for APIGateway
    let awsConfig = {
      region:          region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };
    _this.ApiGateway   = require('../../utils/aws/ApiGateway')(awsConfig);

    // Find or Create REST API
    return new BbPromise(function(resolve, reject) {

      // Load Region JSON
      let regionJson = JawsUtils.getProjRegionConfigForStage(
          _this.Jaws._projectJson,
          evt.stage,
          region);

      // Check Project's jaws.json for restApiId, otherwise create a REST API in this region.
      if (regionJson.restApiId) {

        let params = {
          restApiId: regionJson.restApiId /* required */
        };

        // Show existing REST API
        return _this.ApiGateway.getRestApiPromised(params)
            .then(function(response) {

              JawsUtils.jawsDebug(
                  '"'
                  + evt.stage + ' - '
                  + region
                  + '": found existing REST API on AWS API Gateway with ID: '
                  + response.id);

              return resolve();
            });

      } else {

        let params = {
          limit: 500
        };

        // List all REST APIs
        return _this.ApiGateway.getRestApisPromised(params)
            .then(function(response) {

              let restApiId = false;

              // Find REST API w/ same name as project
              for (let i = 0; i < response.items.length;i++) {

                if (response.items[i].name === _this.Jaws._projectJson.name) {

                  restApiId = response.items[i].id;

                  // Save restApiId to jaws.json for future use
                  JawsUtils.saveRegionalApi(
                      _this.Jaws._projectJson,
                      region,
                      restApiId,
                      _this.Jaws._projectRootPath
                  );

                  JawsUtils.jawsDebug(
                      '"'
                      + evt.stage + ' - '
                      + region
                      + '": found existing REST API on AWS API Gateway with ID: '
                      + restApiId);

                  break;
                }
              }

              // If no REST API found, create one
              if (restApiId) {
                return resolve();
              } else {

                let apiName = _this.Jaws._projectJson.name;
                apiName = apiName.substr(0, 1023); // keep the name length below the limits

                let params = {
                  name: apiName, /* required */
                  description: _this.Jaws._projectJson.description ? _this.Jaws._projectJson.description : 'A REST API for a JAWS project.'
                };

                return _this.ApiGateway.createRestApiPromised(params)
                    .then(function (response) {

                      // Save RestApiId to jaws.json, fetch it from here later
                      JawsUtils.saveRegionalApi(
                          _this.Jaws._projectJson,
                          region,
                          response.id,
                          _this.Jaws._projectRootPath
                      );

                      JawsUtils.jawsDebug(
                          '"'
                          + evt.stage + ' - '
                          + region
                          + '": created a new REST API on AWS API Gateway with ID: '
                          + response.id);

                      return resolve();

                    });
              }
            });
      }
    })
        .then(function() {

          return new BbPromise(function(resolveOne, reject) {

            // Add provisioned array
            evt.provisioned = {
              endpoints: [],
            };

            // Loop through each function
            async.eachSeries(evt.functions, function (func, fCb) {

              let evtClone = {
                stage:  evt.stage,
                region: JawsUtils.getProjRegionConfigForStage(
                    _this.Jaws._projectJson,
                    evt.stage,
                    region),
                path:   func.path,
                endpointAlias:  evt.endpointAlias,
              };

              return _this.Jaws.actions.endpointPackageApiGateway(evtClone)
                  .then(function (evtClone) {

                    return new BbPromise(function (resolveTwo, reject) {

                      // A function can have multiple endpoints.  Process all endpoints for this Function
                      async.eachSeries(evtClone.endpoints, function (endpoint, eCb) {

                        // Set endpoint property
                        evtClone.endpoint = endpoint;

                        return _this.Jaws.actions.endpointBuildApiGateway(evtClone)
                            .then(function (evtProcessed) {

                              // Add provisioned endpoint urls
                              evt.provisioned.endpoints.push({
                                method: evtProcessed.Method,
                                url:    evtProcessed.url
                              });
                              return eCb();
                            });

                      }, function () {
                        return resolveTwo();
                      });
                    }); // BbPromise

                  })
                  .then(fCb);
            }, function () {
              return resolveOne(evt);
            }); // async.eachSeries
          }); // BbPromise
        });
  }

  /**
   * Deploy Endpoint By Region
   */

  _deployEndpointsAllRegions(evt) {

    let _this = this;
    return new BbPromise(function(resolve, reject) {

      // Create API Gateway deployments across all regions, concurrently
      async.eachLimit(evt.regions, 4, function(region, cb) {

        let newEvent = {
          stage:  evt.stage,
          region: JawsUtils.getProjRegionConfigForStage(
              _this.Jaws._projectJson,
              evt.stage,
              region)
        };

        return _this.Jaws.actions.endpointProvisionApiGateway(newEvent)
            .then(cb);

      }, function() {
        return resolve(evt);
      });
    });
  }
}

module.exports = FunctionDeploy;
