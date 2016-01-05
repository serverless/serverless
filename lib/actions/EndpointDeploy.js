'use strict';

/**
 * Action: Endpoint Deploy
 * - Deploys Endpoints
 * - Validates Endpoint paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Endpoint paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Options:
 * - stage:              (String)  The stage to deploy to
 * - region:             (String)  The region in the stage to deploy to
 * - paths:              (Array)   Array of endpoint paths to deploy.  Format: ['users/show@users/show~GET']
 * - aliasEndpoint:      (String)  The Lambda Alias the endpoint should point to.
 * - all:                (Boolean) Indicates whether all Functions in the project should be deployed.
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
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

    constructor(S) {
      super(S);
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
            shortcut:    'p',
            description: 'Optional - Override the API Gateway "functionAlias" Stage Variable'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Select all Functions in your project for deployment'
          }, {
            option:      'description',
            shortcut:    'd',
            description: 'Optional - Provide custom description string for API Gateway stage deployment description'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Endpoint Deploy
     */

    endpointDeploy(evt) {

      let _this = this;
      _this.evt = evt;

      // If CLI, parse arguments
      if (_this.S.cli && (!options || !options.subaction)) {
        _this.evt.options       = JSON.parse(JSON.stringify(_this.S.cli.options)); // Important: Clone objects, don't refer to them
        _this.evt.options.paths = JSON.parse(JSON.stringify(_this.S.cli.params));
        if (_this.S.cli.options.nonInteractive) _this.S.config.interactive = false;
      }

      // Flow
      return new BbPromise(function(resolve) {

        // Prompt: Stage
        if (!_this.S.config.interactive || _this.evt.options.stage) return resolve();

        return _this.cliPromptSelectStage('Function Deployer - Choose a stage: ', _this.evt.options.stage, false)
          .then(stage => {
            _this.evt.options.stage = stage;
            return resolve();
          })
      })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._processDeployment)
        .then(function() {

          // Display Successfully Deployed Endpoints, if any
          if (_this.deployed) {
            SCli.log('Successfully deployed endpoints in "' + _this.evt.options.stage + '" to the following regions:');
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].endpointMethod + ' - ' + region[j].endpointPath + ' - ' + region[j].endpointUrl);
              }
            }
          }

          // Display Failed Deployed Endpoints, if any
          if(_this.failed) {
            SCli.log('Failed to deploy endpoints in "' + _this.evt.options.stage + '" to the following regions:');
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].endpointMethod + ' - ' + region[j].endpointPath + ': ' + region[j].message );
                // Show Error Stacktrace if in debug mode
                SUtils.sDebug(region[j].stack);
              }
            }
            SCli.log('');
            SCli.log('Run this again with --debug to get more error information...');
          }

          /**
           * Return EVT
           */

          _this.evt.data.deployed = _this.deployed;
          _this.evt.data.failed   = _this.failed;
          return _this.evt;

        });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      let _this = this;

      // Instantiate Classes
      _this.project = new this.S.classes.Project(this.S);
      _this.meta    = new this.S.classes.Meta(this.S);

      // Set defaults
      _this.evt.options.paths   = _this.evt.options.paths ? _this.evt.options.paths : [];
      _this.evt.options.all     = !!_this.evt.options.all;
      _this.regions         = _this.evt.options.region ? [_this.evt.options.region] : Object.keys(_this.meta.data.private.stages[_this.evt.options.stage].regions);

      // Validate Paths
      if (!_this.evt.options.paths.length && !_this.evt.options.all) {
        throw new SError(`One or multiple paths are required, or the all option must be set`);
      }

      // Validate Stage
      if (!_this.evt.options.stage) {
        throw new SError(`Stage is required`);
      }

      return BbPromise.resolve();
    }

    /**
     * Process Deployment
     */

    _processDeployment() {

      let _this = this;

      // Status
      SCli.log('Deploying endpoints in "' + _this.evt.options.stage + '" to the following regions: ' + _this.regions.join(', '));
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Get Endpoints w/ populated variables/templates for this region
          _this.endpoints = _this.project.getEndpoints({
            paths:    _this.evt.options.paths,
            populate: true,
            stage:    _this.evt.options.stage,
            region:   region
          });

          // Deploy Endpoints in each region
          return _this._deployEndpointsByRegion(region);
        })
        .then(function() {

          // Stop Spinner
          _this._spinner.stop(true);

        });
    }

    /**
     * Deploy Endpoints By Region
     * - Finds or creates a API Gateway in the region
     * - Deploys all function endpoints queued in a specific region
     */

    _deployEndpointsByRegion(region) {

      let _this = this;

      // Load AWS Service Instance for APIGateway
      let awsConfig    = {
        region:          region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };
      let ApiGateway   = require('../utils/aws/ApiGateway')(awsConfig);

      // Get or Create REST API for Region by name
      let restApi;
      if (_this.meta.data.private.stages[_this.evt.options.stage].regions[region].variables['apiGatewayApi']) {
        restApi = _this.meta.data.private.stages[_this.evt.options.stage].regions[region].variables['apiGatewayApi'];
      } else {
        restApi = _this.project.data.name;
      }

      return ApiGateway.sFindOrCreateRestApi(
        restApi,
        _this.evt.options.stage,
        region)
        .then(function(restApiData) {

          _this.restApiData = restApiData;

          // Persist API to meta
          _this.meta.data.private.stages[_this.evt.options.stage].regions[region].variables['apiGatewayApi'] = restApiData.name;
          _this.meta.save();

          return new BbPromise(function(resolve) {

            // A function can have multiple endpoints.  Process all endpoints for this Function
            async.eachSeries(_this.endpoints, function(endpoint, eCb) {

              // Create new event object
              let options = {
                stage:          _this.evt.options.stage,
                region:         region,
                path:           endpoint.sPath,
                aliasEndpoint:  _this.evt.options.aliasEndpoint,
                aliasRestApi:   _this.evt.options.aliasRestApi
              };

              return _this.S.actions.endpointBuildApiGateway(options)
                .then(function (result) {

                  // Stash deployed endpoints
                  if (!_this.deployed) _this.deployed = {};
                  if (!_this.deployed[region]) _this.deployed[region] = [];
                  _this.deployed[region].push({
                    module:           endpoint.module,
                    function:         endpoint.function,
                    endpointSPath:    endpoint.sPath,
                    endpointPath:     endpoint.data.path,
                    endpointMethod:   endpoint.data.method,
                    endpointUrl:      result.data.url
                  });

                  return eCb();
                })
                .catch(function(e) {

                  // Stash Failed Endpoint
                  if (!_this.failed) _this.failed = {};
                  if (!_this.failed[region]) _this.failed[region] = [];
                  _this.failed[region].push({
                    module:           endpoint.module,
                    function:         endpoint.function,
                    endpointSPath:    endpoint.sPath,
                    endpointPath:     endpoint.data.path,
                    endpointMethod:   endpoint.data.method,
                    message:          e.message,
                    stack:            e.stack
                  });

                  return eCb();
                });

            }, function() {
              return resolve();
            });
          })
            .then(function() {

              // If no endpoints were successfully deployed, skip
              if (!_this.deployed) return;

              // Deploy API Gateway Deployment in region
              let options = {
                stage:       _this.evt.options.stage,
                region:      region,
                restApiId:   _this.restApiData.id,
                description: _this.evt.options.description
              };

              return _this.S.actions.endpointDeployApiGateway(options);
            });
        });
    }
  }

  return( EndpointDeploy );
};