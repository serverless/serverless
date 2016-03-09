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
 * - description:        (String)  Provide custom description string for API Gateway stage deployment description.
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'Error')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    fs           = require('fs'),
    os           = require('os');
  let SUtils;

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class EndpointDeploy extends SPlugin {

    constructor(S) {
      super(S);
      SUtils = S.utils;
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
            shortcut:    'i',
            description: 'Optional - Override the API Gateway "functionAlias" Stage Variable'
          }, {
            option:      'description',
            shortcut:    'd',
            description: 'Optional - Provide custom description string for API Gateway stage deployment description'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Deploy all Functions'
          }
        ],
        parameters: [
          {
            parameter: 'names',
            description: 'The names/ids of the endpoints you want to deploy in this format: user/create#GET',
            position: '0->'
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

      // Flow
      return new BbPromise(function(resolve) {

        // Prompt: Stage
        if (!_this.S.config.interactive || _this.evt.options.stage) return resolve();

        return _this.cliPromptSelectStage('Endpoint Deployer - Choose a stage: ', _this.evt.options.stage, false)
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

      _this.project   = _this.S.getProject();
      _this.aws       = _this.S.getProvider();
      _this.endpoints = [];

      // Set defaults
      _this.evt.options.names  = _this.evt.options.names ? _this.evt.options.names : [];
      _this.regions            = _this.evt.options.region ? [_this.evt.options.region] : _this.project.getAllRegionNames(_this.evt.options.stage);

      if (_this.evt.options.names.length) {
        _this.evt.options.names.forEach(function(name) {
          let endpoint = _this.project.getEndpoint(name.split('#')[0], name.split('#')[1]);
          if (!endpoint) throw new SError(`Endpoint "${name}" doesn't exist in your project`);
          _this.endpoints.push(endpoint);
        });
      }

      // If CLI and no endpoint names targeted, deploy from CWD
      if (_this.S.cli &&
          !_this.evt.options.names.length &&
          !_this.evt.options.all) {

        let functionsByCwd = SUtils.getFunctionsByCwd(_this.project.getAllFunctions());

        functionsByCwd.forEach(function(func) {
          func.getAllEndpoints().forEach(function(endpoint) {
            _this.endpoints.push(endpoint);
          });
        });
      }

      // If --all is selected, load all paths
      if (_this.evt.options.all) {
        _this.endpoints = _this.project.getAllEndpoints();
      }

      if (_this.endpoints.length === 0) throw new SError(`You don't have any endpoints in your project`);

      // Validate Stage
      if (!_this.evt.options.stage) throw new SError(`Stage is required`);

      return BbPromise.resolve();
    }

    /**
     * Process Deployment
     */

    _processDeployment() {

      let _this = this;

      // Status
      console.log('');
      SCli.log('Deploying endpoints in "' + _this.evt.options.stage + '" to the following regions: ' + _this.regions.join(', '));
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

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

      // Get or Create REST API for Region by name
      let restApi;
      if (_this.project.getRegion(_this.evt.options.stage, region).getVariables()['apiGatewayApi']) {
        restApi = _this.project.getRegion(_this.evt.options.stage, region).getVariables()['apiGatewayApi'];
      } else {
        restApi = _this.project.name;
      }

      return _this._findOrCreateRestApi(
        restApi,
        _this.evt.options.stage,
        region)
        .then(function(restApiData) {

          _this.restApiData = restApiData;

          let regionInstance = _this.project.getRegion(_this.evt.options.stage, region);
          regionInstance.addVariables({
            apiGatewayApi: restApiData.name
          });

          return regionInstance.save().then(function(){
            return new BbPromise(function(resolve, reject) {

              // A function can have multiple endpoints.  Process all endpoints for this Function
              async.eachSeries(_this.endpoints, function(endpoint, eCb) {

                return BbPromise.try(function() {

                    // Create new event object
                    let newEvt = {
                      options: {
                        stage: _this.evt.options.stage,
                        region: region,
                        endpointPath: endpoint.path,
                        endpointMethod: endpoint.method,
                        aliasEndpoint: _this.evt.options.aliasEndpoint,
                        aliasRestApi: _this.evt.options.aliasRestApi
                      }
                    };

                    return _this.S.actions.endpointBuildApiGateway(newEvt);
                  })
                  .then(function (result) {

                    // Stash deployed endpoints
                    if (!_this.deployed) _this.deployed = {};
                    if (!_this.deployed[region]) _this.deployed[region] = [];
                    _this.deployed[region].push({
                      endpointPath:     endpoint.path,
                      endpointMethod:   endpoint.method,
                      endpointUrl:      result.data.url
                    });

                    return eCb();
                  })
                  .catch(function(e) {

                    // Stash Failed Endpoint
                    if (!_this.failed) _this.failed = {};
                    if (!_this.failed[region]) _this.failed[region] = [];
                    _this.failed[region].push({
                      endpointPath:     endpoint ? endpoint.path : 'unknown',
                      endpointMethod:   endpoint ? endpoint.method : 'unknown',
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
              let newEvt = {
                options: {
                  stage:       _this.evt.options.stage,
                  region:      region,
                  restApiId:   _this.restApiData.id,
                  description: _this.evt.options.description
                }
              };

              return _this.S.actions.endpointDeployApiGateway(newEvt);
            });
          });
        });
    }

    _findOrCreateRestApi(restApiName, stage, region) {
      let _this = this;

      return _this.aws.getApiByName(restApiName, stage, region)
        .then(function(restApi) {

          // Return, if found
          if (restApi) return restApi;

          // Otherwise, create new REST API
          let params = {
            name:        restApiName, /* required */
            description: 'A REST API for a Serverless project in region: ' + region
          };

          return _this.aws.request('APIGateway', 'createRestApi', params, stage, region)
            .then(function (response) {

              SUtils.sDebug(
                '"'
                + stage
                + ' - '
                + region
                + '": created a new REST API on AWS API Gateway with name: '
                + response.name);

              return response;
            });
        });

    }
  }



  return( EndpointDeploy );
};