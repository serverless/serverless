'use strict';

/**
 * Action: Endpoint Deploy
 * - Deploys Endpoints
 * - Validates Endpoint paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Endpoint paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Event Properties:
 * - stage:              (String)  The stage to deploy to
 * - regions:            (Array)   The region(s) in the stage to deploy to
 * - paths:              (Array)   Array of function paths to deploy.  Format: 'users/show', 'users/create'
 * - aliasEndpoint:      (String)  The Lambda Alias the endpoint should point to.
 * - all:                (Boolean) Indicates whether all Functions in the project should be deployed.
 * - endpoints:          (Array)   Array of endpoint JSONs
 * - deployed: (Object)  Contains regions and the code functions that have been uploaded to the S3 bucket in that region
 */

module.exports = function(SPlugin, serverlessPath) {
  const path       = require('path'),
      SError       = require(path.join(serverlessPath, 'ServerlessError')),
      SUtils       = require(path.join(serverlessPath, 'utils/index')),
      SCli         = require(path.join(serverlessPath, 'utils/cli')),
      BbPromise    = require('bluebird'),
      async        = require('async'),
      fs           = require('fs'),
      os           = require('os');

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class EndpointDeploy extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EndpointDeploy.name;
    }

    registerActions() {

      this.S.addAction(this.endpointDeploy.bind(this), {
        handler:       'endpointDeploy',
        description:   'Deploys REST API endpoints',
        context:       'endpoint',
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
            shortcut:    'e',
            description: 'Optional - Point Endpoint(s) to a specific Lambda alias'
          }, {
            option:      'aliasRestApi', // TODO: Implement
            shortcut:    'r',
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
     * Endpoint Deploy
     */

    endpointDeploy(event) {

      let _this = this,
          evt   = {};

      // If CLI, parse options
      if (_this.S.cli) {

        // Options
        evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

        // Option - Non-interactive
        if (_this.S.cli.options.nonInteractive) _this.S._interactive = false

        // Endpoint paths - They should be all params
        evt.paths  = _this.S.cli.params;
      }

      // If NO-CLI, add options
      if (event) evt = event;

      // Add defaults
      evt.stage               = evt.stage ? evt.stage : null;
      evt.regions             = evt.region ? [evt.region] : [];
      evt.paths               = evt.paths ? evt.paths : [];
      evt.all                 = evt.all ? true : false;
      evt.aliasEndpoint       = evt.aliasEndpoint ? evt.aliasEndpoint : null;
      evt.aliasRestApi        = evt.aliasRestApi ? evt.aliasRestApi : null;
      evt.endpoints           = [];
      evt.deployed            = {};

      // Flow
      return _this._validateAndPrepare(evt)
          .bind(_this)
          .then(_this._prepareEndpoints)
          .then(function(evt) {
              return _this.cliPromptSelectStage('Endpoint Deployer - Choose a stage: ', evt.stage, false)
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

    _validateAndPrepare(evt) {

      let _this = this;

      // If NO-CLI, validate paths
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

      return BbPromise.resolve(evt);
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

              if (!endpoints.length) throw new SError(`No endpoints found`);
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

      // IF CLI +  no ALL + no paths - prompt user to select endpoints
      if (_this.S.cli && !evt.all && !evt.paths.length) {
        return _this.cliPromptSelectEndpoints(
            process.cwd(),
            'Select the endpoints you wish to deploy:',
            true,
            true)
            .then(function (selected) {
              evt.endpoints = selected;
              return evt;
            });
      }
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

      // Delete region for neatness
      if (evt.region) delete evt.region;

      return evt;
    }

    /**
     * Process Deployment
     */

    _processDeployment(evt) {

      let _this = this;

      // Status
      SCli.log('Deploying endpoints in "' + evt.stage + '" to the following regions: ' + evt.regions);
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
            return evt.regions;
          })
          .bind(_this)
          .each(function(region) {

            // Add Deployed Region
            evt.deployed[region] = [];

            // Deploy Endpoints in each region
            return _this._deployEndpointsByRegion(evt, region)
          })
          .then(function() {

            // Status
            _this._spinner.stop(true);
            SCli.log('Successfully deployed endpoints in "' + evt.stage + '" to the following regions:');

            // Display Methods & URLS
            for (let i = 0; i < Object.keys(evt.deployed).length; i++) {
              let region = evt.deployed[Object.keys(evt.deployed)[i]];
              SCli.log(Object.keys(evt.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].method + ' - ' + region[j].url);
              }
            }

            return evt;
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
                      evt.deployed[region].push({
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

  return( EndpointDeploy );
};
