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
 * - queued.type:      (String)  "code", "endpoint", "all".  The type of Function Deploy.
 * - queued.stage:     (String)  The stage to deploy to
 * - queued.regions:   (Array)   The region(s) in the stage to deploy to
 * - queued.noExeCf:   (Boolean) Don't execute CloudFormation
 * - queued.paths:     (Array)   Array of function paths to deploy.  Format: 'users/show', 'users/create'
 * - queued.functions: (Array)   Array of function JSONs from fun.sl.json
 * - uploaded:         (Object)  Contains regions and the functions that have been uploaded to the S3 bucket in that region
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
          description: 'Optional if only one region is defined in stage'
        }, {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Don\'t execute CloudFormation, just generate it',
        }, {
          option:      'endpointAlias',
          shortcut:    'ea',
          description: 'Optional, endpoint only.  Point the endpoint to a Lambda with a specific endpointAlias'
        }
      ],
    });

    // TODO: Add "all" option

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  functionDeploy(event) {

    let _this                 = this;
    let evt                   = {};
    evt.queued                = {};
    evt.queued.type           = event.type ? event.type : null;
    evt.queued.stage          = event.stage ? event.stage : null;
    evt.queued.regions        = event.region ? [event.region] : [];
    evt.queued.noExeCf        = (event.noExeCf == true || event.noExeCf == 'true');
    evt.queued.paths          = event.paths ? event.paths : [];
    evt.uploaded              = {};

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._promptStage)
        .then(_this._deployRegions)
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

      // Add type.  Should be first in array
      evt.queued.type   = _this.Jaws.cli.params[0];

      // Add function paths.   Should be all other array items
      _this.Jaws.cli.params.splice(0,1);
      evt.queued.paths  = _this.Jaws.cli.params;
    }

    // If NO-CLI, validate
    if (!_this.Jaws.cli) {

      // Check paths
      if (!evt.queued.paths.length) {
        throw new JawsError(`One or multiple paths are required`);
      }
    }

    // Validate type
    if (!evt.queued.type ||
        (evt.queued.type !== 'code' &&
        evt.queued.type  !== 'endpoint' &&
        evt.queued.type  !== 'all')) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "all" `);
    }

    // Validate stage
    if (!evt.queued.stage) {
      throw new JawsError(`Stage is required`);
    }

    // If no region specified, deploy to all regions in stage
    if (!evt.queued.regions.length) {
      evt.queued.regions  = _this.Jaws._projectJson.stages[evt.queued.stage].map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Queued regions: ' + evt.queued.regions);

    // If CLI and paths are missing, get paths from CWD, and return
    if (_this.Jaws.cli) {
      if (!evt.queued.paths || !evt.queued.paths.length) {

        // If CLI and no paths, get full paths from CWD
        return JawsUtils.getFunctions(process.cwd(), null)
            .then(function(functions) {

              if (!functions.length) throw new JawsError(`No functions found`);

              evt.queued.functions = functions;
              return evt;
            });
      }
    }

    // Otherwise, resolve full paths
    return JawsUtils.getFunctions(_this.Jaws._projectRootPath, evt.queued.paths)
        .then(function(functions) {
          evt.queued.functions = functions;
          return evt;
        });
  }

  /**
   * Prompt Stage
   */

  _promptStage(evt) {

    let _this  = this,
        stages = [];

    if (!evt.queued.stage) {

      stages = Object.keys(_this.Jaws._projectJson.stage);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) evt.queued.stage = stages[0];

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
          evt.queued.stage = results[0].value;
          return evt;
        });
  }

  /**
   * Deploy Regions
   */

  _deployRegions(evt) {

    let _this = this;

    return BbPromise.try(function() {
          return evt.queued.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Deploy Type
          switch(evt.queued.type) {

            // Deploy Endpoint only
            case "endpoint":
              return _this._deployEndpointByRegion(evt, region);
              break;
            // Deploy Code only
            case "code":
              return _this._prepareCodeByRegion(evt, region);
              break;
            // Deploy Code then Endpoint
            case "all":
              break;
            // Default
            default:
              return BbPromise.resolve();
          }
        })
        .then(function() {

          // If type "code" or "all", trigger Lambda CloudFormation Stack Update
          // Perform across all Stage Regions concurrently
          if (['code', 'all'].indexOf(evt.queued.type) > -1) {
            return _this._deployCodeAllRegions(evt);
          } else {
            return evt;
          }
        });
  }

  /**
   * Prepare Code By Region
   * @region
   */

  _prepareCodeByRegion(evt, region) {
    let _this = this;

    return new BbPromise(function(resolve, reject) {

      // Create uploaded array for this region
      evt.uploaded[region] = [];

      // Package & Upload functions' code concurrently
      // Package must be redone for each region because ENV vars are set for each region
      async.eachLimit(evt.queued.functions, 5, function(func, cb) {

        // Create new evt object for concurrent operations
        let evtClone = {
          stage: evt.queued.stage,
          region: JawsUtils.getProjRegionConfigForStage(
              _this.Jaws._projectJson,
              evt.queued.stage,
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
              evt.uploaded[region].push(evtCloneProcessed.function);
              return cb();
            })
            .catch(function(e) {
              JawsCli.log('Error deploying function ' + evt.queued.type + ':');
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
      if (evt.queued.type === 'endpoint') return resolve();
      // If type is "code" or "all", do concurrent, multi-region, CF update
      async.eachLimit(Object.keys(evt.uploaded), 5, function(region, cb) {
        let newEvent = {
          stage: evt.queued.stage,
          region: JawsUtils.getProjRegionConfigForStage(
              _this.Jaws._projectJson,
              evt.queued.stage,
              region),
          functions: evt.uploaded[region],
        };

        return _this.Jaws.actions.codeProvisionLambdaNodejs(newEvent)
            .then(cb);

      }, function() {
        return resolve(evt);
      });
    });
  }

  /**
   * Deploy Endpoint By Region
   * - Finds or creates a API Gateway in the region
   * - Deploys all function endpoints queued in a specific region
   */

  _deployEndpointByRegion(evt, region) {

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
          evt.queued.stage,
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
                  + evt.queued.stage + ' - '
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
                      + evt.queued.stage + ' - '
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
                          + evt.queued.stage + ' - '
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
            async.eachSeries(evt.queued.functions, function (func, fCb) {

              let evtClone = {
                stage:  evt.queued.stage,
                region: JawsUtils.getProjRegionConfigForStage(
                    _this.Jaws._projectJson,
                    evt.queued.stage,
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

        }).then(function() {

          let evtClone = {
            stage:  evt.queued.stage,
            region: JawsUtils.getProjRegionConfigForStage(
                _this.Jaws._projectJson,
                evt.queued.stage,
                region)
          };

          return _this.Jaws.actions.endpointProvisionApiGateway(evtClone);
        });
  }
}

module.exports = FunctionDeploy;
