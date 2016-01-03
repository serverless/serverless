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

    endpointDeploy(options) {

      let _this = this;
      _this.options = options || {};

      // If CLI, parse arguments
      if (_this.S.cli && (!options || !options.subaction)) {
        _this.options       = JSON.parse(JSON.stringify(_this.S.cli.options)); // Important: Clone objects, don't refer to them
        _this.options.paths = JSON.parse(JSON.stringify(_this.S.cli.params));
        if (_this.S.cli.options.nonInteractive) _this.S.config.interactive = false;
      }

      // Flow
      return new BbPromise(function(resolve) {

        // Prompt: Stage
        if (!_this.S.config.interactive || _this.options.stage) return resolve();

        return _this.cliPromptSelectStage('Function Deployer - Choose a stage: ', _this.options.stage, false)
          .then(stage => {
            _this.options.stage = stage;
            return resolve();
          })
      })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(function() {
          return _this.cliPromptSelectStage('Endpoint Deployer - Choose a stage: ', _this.options.stage, false)
            .then(stage => {
              _this.options.stage = stage;
              return _this.options;
            })
        })
        .then(_this._processDeployment)
        .then(function() {

          if (_this.failed) {

            // Status
            SCli.log('Failed to deploy the following endpoints in "' + _this.options.stage + '" to the following regions:');

            // Display Methods & URLS
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].function + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }
          } else {

            // Status
            SCli.log('Successfully deployed endpoints in "'
              + _this.options.stage
              + '" to the following regions: ');

            // Display Functions & ARNs
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j]);
              }
            }
          }

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
      _this.options.paths   = _this.options.paths ? _this.options.paths : [];
      _this.options.all     = !!_this.options.all;
      _this.regions         = _this.options.region ? [_this.options.region] : Object.keys(_this.meta.data.private.stages[_this.options.stage].regions);
      _this.deployed        = {};
      _this.failed          = {};

      // Validate Paths
      if (!_this.options.paths.length && !_this.options.all) {
        throw new SError(`One or multiple paths are required, or the all option must be set`);
      }

      // Validate Stage
      if (!_this.options.stage) {
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
      SCli.log('Deploying endpoints in "' + _this.options.stage + '" to the following regions: ' + _this.regions.join('/'));
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Get Endpoints w/ populated variables/templates for this region
          _this.endpoints = _this.project.getEndpoints({
            paths:    _this.options.paths,
            populate: true,
            stage:    _this.options.stage,
            region:   region
          });

          // Add Deployed Region
          _this.deployed[region] = [];

          // Deploy Endpoints in each region
          return _this._deployEndpointsByRegion(region);
        })
        .then(function() {

          // Status
          _this._spinner.stop(true);
          SCli.log('Successfully deployed endpoints in "' + _this.options.stage + '" to the following regions:');

          // Display Methods & URLS
          for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
            let region = _this.deployed[Object.keys(_this.deployed)[i]];
            SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
            for (let j = 0; j < region.length; j++) {
              SCli.log('  ' + region[j].method + ' - ' + region[j].url);
            }
          }

          if(_this.failed) {

            SCli.log('FAILED to deploy endpoints in "' + _this.options.stage + '" to the following regions:');

            // Display Methods & URLS
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].endpoint.method + ' - ' + region[j].endpoint.path + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }
          }

          return _this.options;
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

      // Get or Create REST API for Region
      return ApiGateway.sFindOrCreateRestApi(
        _this.project.data.name,
        _this.options.stage,
        region)
        .then(function(restApi) {

          // Persist API to meta
          _this.meta.data.private.stages[_this.options.stage].regions[region].variables['apiGatewayApi'] = restApi.id;
          _this.meta.save();

          return new BbPromise(function(resolve) {

            // A function can have multiple endpoints.  Process all endpoints for this Function
            async.eachSeries(_this.endpoints, function(endpoint, eCb) {

              // Create new event object
              let options = {
                stage:          _this.options.stage,
                region:         region,
                path:           endpoint._sPath,
                aliasEndpoint:  _this.options.aliasEndpoint,
                aliasRestApi:   _this.options.aliasRestApi
              };

              return _this.S.actions.endpointBuildApiGateway(options)
                .then(function (optionsProcessed) {

                  // Add provisioned endpoint urls
                  _this.deployed[region].push({
                    function: optionsProcessed.endpoint._function.name,
                    method:   optionsProcessed.endpoint.method,
                    url:      optionsProcessed.endpoint.url
                  });

                  return eCb();
                })
                .catch(function(e) {

                  // Stash Failed Endpoint
                  if (!_this.failed) _this.failed = {};
                  if (!_this.failed[region]) _this.failed[region] = [];
                  _this.failed[region].push({
                    message:  e.message,
                    stack:    e.stack,
                    endpoint: endpoint
                  });

                  return eCb();
                });

            }, function() {
              return resolve();
            });
          })
            .then(function() {

              // Deploy API Gateway Deployment in region
              let options = {
                stage:       _this.options.stage,
                region:      region,
                description: _this.options.description
              };

              return _this.S.actions.endpointDeployApiGateway(options);
            });
        });
    }
  }

  return( EndpointDeploy );
};