'use strict';

/**
 * Action: Endpoint Deploy ApiGateway
 * - Deploys Endpoints and their REST APIs on API Gateway
 * - Can Handle multiple regions
 *
 * Options:
 * - stage:              (String)  The stage to deploy to
 * - region:             (String)  A single region in the stage to deploy to
 * - names:              (Array)   Array of endpoint names to deploy.  Format: ['users/show~GET'] path~method
 * - aliasEndpoint:      (String)  The Lambda Alias the endpoint should point to.
 * - description:        (String)  Provide custom description string for API Gateway stage deployment description.
 */

module.exports = function(SPlugin, serverlessPath) {
  const path      = require('path'),
    SError        = require(path.join(serverlessPath, 'Error')),
    SCli          = require('../utils/cli'),
    BbPromise     = require('bluebird'),
    async         = require('async'),
    fs            = require('fs');
  let SUtils;

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class EndpointDeployApiGateway extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + EndpointDeployApiGateway.name;
    }

    registerActions() {
      this.S.addAction(this.endpointDeployApiGateway.bind(this), {
        handler:     'endpointDeployApiGateway',
        description: 'Deploys a REST API to API Gateway in one or multiple regions'
      });
      return Promise.resolve();
    }

    /**
     * Handler
     */

    endpointDeployApiGateway(evt) {

      let _this              = this;
      _this.evt              = evt;
      _this.project          = _this.S.getProject();
      _this.provider         = _this.S.getProvider();
      _this.awsAccountNumber = _this.project.getRegion(_this.evt.options.stage, _this.evt.options.region).getVariables().iamRoleArnLambda.replace('arn:aws:iam::', '').split(':')[0];
      _this.regions          = _this.evt.options.region ? [_this.evt.options.region] : _this.project.getAllRegionNames(_this.evt.options.stage);
      _this.spinner          = SCli.spinner();
      _this.endpoints        = _this.project.getEndpointsByNames(_this.evt.options.names);

      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._processDeployment)
        .then(function() {

          /**
           * Return EVT
           */

          return _this.evt;
        });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {
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
      _this.spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Process each Region
          return _this._processRegionDeployment(region);
        })
        .then(function() {

          // Stop Spinner
          _this.spinner.stop(true);

        });
    }

    /**
     * Process Deployment In Region
     */

    _processRegionDeployment(region) {

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

          return regionInstance.save();
        })
        .bind(_this)
        .then(_this._createAuthorizers)
        .then(function() {

          // Build REST API Endpoints

          return new BbPromise(function (resolve, reject) {

            // A function can have multiple endpoints.  Process all endpoints for this Function
            async.eachSeries(_this.endpoints, function (endpoint, eCb) {

              return BbPromise.try(function () {

                  // Find authorizerId, if specified
                  let authorizerId;
                  if (endpoint.authorizerFunction) {
                    if (_this.authorizers[endpoint.authorizerFunction]) {
                      authorizerId = _this.authorizers[endpoint.authorizerFunction];
                    } else {
                      throw new SError(`Endpoint ${endpoint.getName()} has an 'authorizerFunction' specified that does not exist in this project.`);
                    }
                  }
                  if (endpoint.authorizerId) {
                    authorizerId = endpoint.authorizerId;
                  }

                  // Create new event object
                  let newEvt = {
                    options: {
                      stage:          _this.evt.options.stage,
                      region:         region,
                      name:           endpoint.getName(),
                      authorizerId:   authorizerId ? authorizerId : null,
                      aliasEndpoint:  _this.evt.options.aliasEndpoint
                    }
                  };

                  return _this.S.actions.endpointBuildApiGateway(newEvt);
                })
                .then(function (result) {

                  // Stash deployed endpoints
                  if (!_this.evt.data.deployed) _this.evt.data.deployed = {};
                  if (!_this.evt.data.deployed[region]) _this.evt.data.deployed[region] = [];
                  _this.evt.data.deployed[region].push({
                    endpointPath:   endpoint.path,
                    endpointMethod: endpoint.method,
                    endpointUrl:    result.data.url
                  });

                  return eCb();
                })
                .catch(function (e) {

                  // Stash Failed Endpoint
                  if (!_this.evt.data.failed) _this.evt.data.failed = {};
                  if (!_this.evt.data.failed[region]) _this.evt.data.failed[region] = [];
                  _this.evt.data.failed[region].push({
                    endpointPath:   endpoint ? endpoint.path : 'unknown',
                    endpointMethod: endpoint ? endpoint.method : 'unknown',
                    message:        e.message,
                    stack:          e.stack
                  });

                  return eCb();
                });

            }, function () {
              return resolve();
            });
          })
        })
        .then(function() {

          // If no endpoints were successfully deployed, skip
          if (!_this.evt.data.deployed || !_this.evt.data.deployed[region]) return;

          // Deploy API Gateway Deployment in region
          return _this._createDeployment();
        });
    }

    /**
     * Find Or Create REST API
     */

    _findOrCreateRestApi(restApiName, stage, region) {
      let _this = this;

      return _this.provider.getApiByName(restApiName, stage, region)
        .then(function(restApi) {

          // Return, if found
          if (restApi) return restApi;

          // Otherwise, create new REST API
          let params = {
            name:        restApiName, /* required */
            description: 'A REST API for a Serverless project in region: ' + region
          };

          return _this.provider.request('APIGateway', 'createRestApi', params, stage, region)
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

    /**
     * Create Authorizers
     */

    // TODO: Loop through each function, check if authorizer exists, find or create it

    _createAuthorizers() {

      let _this                  = this;
      let functions              = _this.project.getAllFunctions();
      _this.authorizers          = {};

      return BbPromise.try(function() {

          // Delete pre-existing on authorizers deployed on API Gateway
          let params = {
            restApiId: _this.restApiData.id,
            limit: 100
          };

          return _this.provider.request('APIGateway', 'getAuthorizers', params, _this.evt.options.stage, _this.evt.options.region)
            .then(function(a) {
              return a.items;
            });
        })
        .each(function(a) {

          // Otherwise, delete pre-existing on authorizers deployed on API Gateway
          let params = {
            restApiId:    _this.restApiData.id,
            authorizerId: a.id
          };

          return _this.provider.request('APIGateway', 'deleteAuthorizer', params, _this.evt.options.stage, _this.evt.options.region);
        })
        .then(function() {
          return functions;
        })
        .each(function(fn) {

          // If no authorizer data, skip
          if (!fn.authorizer || !Object.keys(fn.authorizer).length) return;

          let f = fn.toObjectPopulated({ stage: _this.evt.options.stage, region: _this.evt.options.region });

          // Create new authorizer on API Gateway

          // Fetch Lambda
          let params = {
            FunctionName: fn.getDeployedName({ stage: _this.evt.options.stage, region: _this.evt.options.region }),
            Qualifier: _this.evt.options.stage
          };

          return _this.provider.request('Lambda', 'getFunction', params, _this.evt.options.stage, _this.evt.options.region)
            .then(function(l) {
              // Validate required authorizer params
              if (!f.authorizer.identitySource) throw new SError(`Authorizer is missing identitySource property in function ${f.name}`);

              // Create Authorizer params.  Set defaults.
              let authorizer           = f.authorizer;
              authorizer.restApiId     = _this.restApiData.id;
              authorizer.name          = authorizer.name || fn.getDeployedName({ stage: _this.evt.options.stage, region: _this.evt.options.region });
              authorizer.type          = authorizer.type || 'TOKEN';

              let alias = '${stageVariables.functionAlias}';

              // Construct authorizer URI
              authorizer.authorizerUri = 'arn:aws:apigateway:'
                + _this.evt.options.region
                + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
                + _this.evt.options.region
                + ':'
                + _this.awsAccountNumber
                + ':function:'
                + fn.getDeployedName({ stage: _this.evt.options.stage, region: _this.evt.options.region })
                + ':'
                + alias
                + '/invocations';

              return _this.provider.request('APIGateway', 'createAuthorizer', authorizer, _this.evt.options.stage, _this.evt.options.region)
                .then(function(a) {
                  _this.authorizers[fn.name] = a.id;
                });
            });
        });
    }

    /**
     * Create Deployment
     */

    _createDeployment() {

      let _this = this;

      return new BbPromise( function( resolve, reject ){

        let doDeploy = function() {

          let params = {
            restApiId:        _this.restApiData.id, /* required */
            stageName:        _this.evt.options.stage, /* required */
            //cacheClusterEnabled:  false, TODO: Implement
            //cacheClusterSize: '0.5 | 1.6 | 6.1 | 13.5 | 28.4 | 58.2 | 118 | 237', TODO: Implement
            description:      _this.evt.options.description || 'Serverless deployment',
            stageDescription: _this.evt.options.stage,
            variables: {
              functionAlias:  _this.evt.options.stage
            }
          };

          _this.provider.request('APIGateway', 'createDeployment', params, _this.evt.options.stage, _this.evt.options.region)
            .then(function(response) {

              _this.deployment = response;

              SUtils.sDebug(
                '"'
                + _this.evt.options.stage
                + ' - '
                + _this.evt.options.region
                + ' - REST API: '
                + 'created API Gateway deployment: '
                + response.id);

              return resolve();
            })
            .catch(function(error) {
              if( error.statusCode == 429 ) {
                SUtils.sDebug("'Too many requests' received, sleeping 5 seconds");
                setTimeout( doDeploy, 5000 );
              } else
                reject( new SError(error.message) );
            });
        };

        return doDeploy();
      });
    }
  }

  return( EndpointDeployApiGateway );
};