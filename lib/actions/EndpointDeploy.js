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

      // If NO-CLI, add options
      _this.options = options;

      // Add defaults
      _this.options.stage           = _this.options.stage ? _this.options.stage : null;
      _this.options.regions         = _this.options.region ? [_this.options.region] : [];
      _this.options.paths           = _this.options.paths ? _this.options.paths : [];
      _this.options.all             = _this.options.all ? true : false;
      _this.options.aliasEndpoint   = _this.options.aliasEndpoint ? _this.options.aliasEndpoint : null;
      _this.options.aliasRestApi    = _this.options.aliasRestApi ? _this.options.aliasRestApi : null;
      _this.options.description     = _this.options.description ? _this.options.description : null;
      _this.endpoints               = [];
      _this.deployed                = {};

      // Flow
      return _this._validateAndPrepare()
          .bind(_this)
          .then(_this._prepareEndpoints)
          .then(function() {
              return _this.cliPromptSelectStage('Endpoint Deployer - Choose a stage: ', _this.options.stage, false)
                .then(stage => {
                    _this.options.stage = stage;
                    return _this.options;
                })
          })
          .then(_this._prepareRegions)
          .then(_this._processDeployment)
          .then(function() {
            return _this.options;
          });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      let _this = this;

      // If NO-CLI, validate paths
      if (!_this.S.cli) {

        // Validate Paths
        if (!_this.options.paths.length && !_this.options.all) {
          throw new SError(`One or multiple paths are required`);
        }

        // Validate Stage
        if (!_this.options.stage) {
          throw new SError(`Stage is required`);
        }
      }

      return BbPromise.resolve(_this.options);
    }

    /**
     * Prepare Endpoints
     */

    _prepareEndpoints() {

      let _this = this;

      // If NO-CLI - Get Endpoints from submitted paths
      if (!_this.S.cli) {

        return SUtils.getEndpoints(
            _this.S.config.projectPath,
            _this.options.all ? null : _this.options.paths)
            .then(function (endpoints) {

              if (!endpoints.length) throw new SError(`No endpoints found`);
              _this.options.endpoints = endpoints;

              // Delete Paths
              if (_this.options.paths) delete _this.options.paths;
              return _this.options;
            });
      }

      // IF CLI + ALL/paths, get endpoints
      if (_this.S.cli && (_this.options.all || _this.options.paths.length)) {

        return SUtils.getEndpoints(
            _this.S.config.projectPath,
            _this.options.all ? null : _this.options.paths)
            .then(function (endpoints) {

              if (!endpoints.length) throw new SError(`No endpoints found`);
              _this.options.endpoints = endpoints;

              // Delete Paths
              if (_this.options.paths) delete _this.options.paths;
              return _this.options;
            });
      }

      // IF CLI +  no ALL + no paths - prompt user to select endpoints
      if (_this.S.cli && !_this.options.all && !_this.options.paths.length) {
        return _this.cliPromptSelectEndpoints(
            process.cwd(),
            'Select the endpoints you wish to deploy:',
            true,
            true)
            .then(function (selected) {
              _this.options.endpoints = selected;
              return _this.options;
            });
      }
    }


    /**
     * Prepare Regions
     */

    _prepareRegions() {

      // If no region specified, deploy to all regions in stage
      if (!_this.options.regions.length) {
        _this.options.regions  = Object.keys(this.S._meta.private.stages[_this.options.stage].regions);
      }

      // Delete region for neatness
      if (_this.options.region) delete _this.options.region;

      return _this.options;
    }

    /**
     * Process Deployment
     */

    _processDeployment() {

      let _this = this;

      // Status
      SCli.log('Deploying endpoints in "' + _this.options.stage + '" to the following regions: ' + _this.options.regions);
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
            return _this.options.regions;
          })
          .bind(_this)
          .each(function(region) {

            // Add Deployed Region
            _this.options.deployed[region] = [];

            // Deploy Endpoints in each region
            return _this._deployEndpointsByRegion(_this.options, region)
          })
          .then(function() {

            // Status
            _this._spinner.stop(true);
            SCli.log('Successfully deployed endpoints in "' + _this.options.stage + '" to the following regions:');

            // Display Methods & URLS
            for (let i = 0; i < Object.keys(_this.options.deployed).length; i++) {
              let region = _this.options.deployed[Object.keys(_this.options.deployed)[i]];
              SCli.log(Object.keys(_this.options.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].method + ' - ' + region[j].url);
              }
            }

            if( _this.options.failed ){
              SCli.log('FAILED to deploy endpoints in "' + _this.options.stage + '" to the following regions:');

              // Display Methods & URLS
              for (let i = 0; i < Object.keys(_this.options.failed).length; i++) {
                let region = _this.options.failed[Object.keys(_this.options.failed)[i]];
                SCli.log(Object.keys(_this.options.failed)[i] + ' ------------------------');
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

      let _this = this,
          regionConfig = SUtils.getRegionConfig(
          _this.S._project,
          _this.options.stage,
          region);

      // Load AWS Service Instance for APIGateway
      let awsConfig    = {
        region:          region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey,
      };
      let ApiGateway   = require('../utils/aws/ApiGateway')(awsConfig);

      // Get or Create REST API for Region
      return ApiGateway.sFindOrCreateRestApi(
          _this.S,
          _this.options.stage,
          region)
          .then(function(restApi) {

            return new BbPromise(function(resolve, reject) {

              // A function can have multiple endpoints.  Process all endpoints for this Function
              async.eachSeries(_this.options.endpoints, function(endpoint, eCb) {

                // Create new event object
                let optionsClone = {
                  stage:          _this.options.stage,
                  region:         regionConfig,
                  endpoint:       endpoint,
                  aliasEndpoint:  _this.options.aliasEndpoint,
                  aliasRestApi:   _this.options.aliasRestApi,
                };

                return _this.S.actions.endpointBuildApiGateway(optionsClone)
                    .then(function (optionsProcessed) {
                      // Add provisioned endpoint urls
                      _this.options.deployed[region].push({
                        function: optionsProcessed.endpoint.function.name,
                        method:   optionsProcessed.endpoint.method,
                        url:      optionsProcessed.endpoint.url
                      });

                      return eCb();
                    })
                    .catch(function(e) {

                      // Stash Failed Endpoint
                      if (!_this.options.failed) _this.options.failed = {};
                      if (!_this.options.failed[region]) _this.options.failed[region] = [];
                      _this.options.failed[region].push({
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

                  let newEvent = {
                    stage:  _this.options.stage,
                    region: regionConfig,
                    description: _this.options.description
                  };

                  return _this.S.actions.endpointDeployApiGateway(newEvent);
                });
          });
    }
  }

  return( EndpointDeploy );
};
