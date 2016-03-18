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

module.exports = function(S) {
  const path  = require('path'),
    SUtils    = S.utils,
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    BbPromise = require('bluebird'),
    async     = require('async'),
    fs        = BbPromise.promisifyAll(require('fs'));

  class EndpointDeployApiGateway extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.endpointDeployApiGateway.bind(this), {
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
      _this.project          = S.getProject();
      _this.provider         = S.getProvider();
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
        .then(() => this._deployAuthorizers(region))
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
                      throw new SError(`Endpoint ${endpoint.getName()} has an 'authorizerFunction' specified that does not exist in this project.  Make sure the function's 'authorizer' property is filled in`);
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

                  return S.actions.endpointBuildApiGateway(newEvt);
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
          return _this._createDeployment(region);
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
     * Deploy Authorizers
     */

    _deployAuthorizers(region) {

      let _this                  = this;
      let functions              = _this.project.getAllFunctions();
      _this.authorizers          = [];
      _this.deployedAuthorizers  = [];

      return BbPromise.try(function() {

          // Get all authorizers of REST API
          let params = {
            restApiId: _this.restApiData.id,
            limit: 100
          };

          return _this.provider.request('APIGateway', 'getAuthorizers', params, _this.evt.options.stage, region)
            .then(function(a) {
              _this.deployedAuthorizers = a.items;
              return functions;
            });
        })
        .each(function(f) {

          let fPopulated = f.toObjectPopulated({ stage: _this.evt.options.stage, region});

          // If no authorizer data, skip
          if (!fPopulated.authorizer || !Object.keys(fPopulated.authorizer).length) return;

          let updateId         = false;

          _this.deployedAuthorizers.forEach(function(da) {
            if (da.name === f.name) updateId = da.id;
          });

          if (!updateId) {
            return _this._createAuthorizer(f, fPopulated, region);
          } else {
            return _this._updateAuthorizer(f, fPopulated, updateId, region);
          }
        })
    }

    /**
     * Create Authorizer
     */

    _createAuthorizer(f, fPopulated, region) {

      let _this = this;

      // Validate required authorizer params
      if (!fPopulated.authorizer.identitySource) throw new SError(`Authorizer is missing identitySource property in function ${fPopulated.name}`);

      // Create Authorizer params.  Set defaults.
      let authorizer           = fPopulated.authorizer;
      authorizer.restApiId     = _this.restApiData.id;
      authorizer.name          = f.name;
      authorizer.type          = authorizer.type || 'TOKEN';
      authorizer.authorizerResultTtlInSeconds = authorizer.authorizerResultTtlInSeconds || "300";

      // Construct authorizer URI
      authorizer.authorizerUri = 'arn:aws:apigateway:'
        + region
        + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
        + region
        + ':'
        + _this.provider.getAccountId(_this.evt.options.stage, region)
        + ':function:'
        + f.getDeployedName({ stage: _this.evt.options.stage, region})
        + ':'
        + '${stageVariables.functionAlias}'
        + '/invocations';

      return _this.provider.request('APIGateway', 'createAuthorizer', authorizer, _this.evt.options.stage, region)
        .then(function(a) {
          _this.authorizers[f.name] = a.id;
        })
        .then(function() {

          // Add permission to the authorizer Lambda so API G can access it
          let functionName = f.getDeployedName({ stage: _this.evt.options.stage, region});
          return _this._addLambdaPermissionForAuthorizer(_this.authorizers[f.name], functionName, region);
        });
    }

    /**
     * Update Authorizer
     */

    _updateAuthorizer(f, fPopulated, updateId, region) {

      let _this = this;

      // Validate required authorizer params
      if (!fPopulated.authorizer.identitySource) throw new SError(`Authorizer is missing identitySource property in function ${fPopulated.name}`);

      // Create Authorizer params.  Set defaults.
      let params                 = {};
      let authorizer             = fPopulated.authorizer;
      params.restApiId           = _this.restApiData.id;
      params.authorizerId        = updateId;
      authorizer.authorizerResultTtlInSeconds = authorizer.authorizerResultTtlInSeconds || "300";

      // Construct authorizer URI
      let authorizerUri = 'arn:aws:apigateway:'
        + region
        + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
        + region
        + ':'
        + _this.provider.getAccountId(_this.evt.options.stage, region)
        + ':function:'
        + f.getDeployedName({ stage: _this.evt.options.stage, region })
        + ':'
        + '${stageVariables.functionAlias}'
        + '/invocations';

      // Update authorizer properties
      params.patchOperations = [
        {
          op:    "replace",
          path:  "/name",
          value: f.name
        },
        {
          op:    "replace",
          path:  "/authorizerUri",
          value: authorizerUri
        },
        {
          op:    "replace",
          path:  "/identitySource",
          value: authorizer.identitySource
        }
      ];
      if (authorizer.identityValidationExpression) params.patchOperations.push({
        op:    "replace",
        path:  "/identityValidationExpression",
        value: authorizer.identityValidationExpression
      });
      if (authorizer.authorizerResultTtlInSeconds) params.patchOperations.push({
        op:    "replace",
        path:  "/authorizerResultTtlInSeconds",
        value: authorizer.authorizerResultTtlInSeconds
      });

      // Perform update
      return _this.provider.request('APIGateway', 'updateAuthorizer', params, _this.evt.options.stage, region)
        .then(function(a) {

          _this.authorizers[f.name] = a.id;

          // Add permission to the authorizer Lambda so API G can access it
          let functionName = f.getDeployedName({ stage: _this.evt.options.stage, region });
          return _this._removeLambdaPermissionForAuthorizer(functionName, region)
            .then(function() {
              return _this._addLambdaPermissionForAuthorizer(_this.authorizers[f.name], functionName, region);
            });
        });
    }

    /**
     * Create Deployment
     */

    _createDeployment(region) {

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

          _this.provider.request('APIGateway', 'createDeployment', params, _this.evt.options.stage, region)
            .then(function(response) {

              _this.deployment = response;

              SUtils.sDebug(
                '"'
                + _this.evt.options.stage
                + ' - '
                + region
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

    /**
     * Get Authorizer Permission Statement ID
     * - Add direct permission to the Lambda for API G authorizer to access the lambda.  Using an IAM role adds 250 - 500ms of latency
     */

    _generateAuthorizerStatementId(functionName) {
      return ('s_apig_auth_' + functionName);
    }

    /**
     * Add Lambda Permission For Authorizer
     */

    _addLambdaPermissionForAuthorizer(authorizerId, functionName, region) {

      let _this = this;

      // Generate StatementId
      let lambdaPolicyStatementId = _this._generateAuthorizerStatementId(functionName);

      // Create new access policy statement
      let params          = {};
      params.Action       = 'lambda:InvokeFunction';
      params.FunctionName = functionName;
      params.Qualifier    = _this.evt.options.stage;
      params.Principal    = 'apigateway.amazonaws.com';
      params.StatementId  = lambdaPolicyStatementId;
      params.SourceArn    = 'arn:aws:execute-api:'
        + region
        + ':'
        + _this.provider.getAccountId(_this.evt.options.stage, region)
        + ':'
        +  _this.restApiData.id
        + '/authorizers/'
        + authorizerId;

      return _this.provider.request('Lambda', 'addPermission', params, _this.evt.options.stage, region)
        .then(function(data) {

          SUtils.sDebug(
            '"'
            + _this.evt.options.stage
            + ' - '
            + region
            + '": '
            + 'added permission to Lambda for the authorizer');
        })
    }

    /**
     * Remove Lambda Permission For Authorizer
     * - Searches Lambda's Policy statements for an authorizer statement added by the Framework
     * - If found, this is removed
     */

    _removeLambdaPermissionForAuthorizer(functionName, region) {

      let _this       = this,
        params,
        lambdaPolicy,
        statement;

      // Generate StatementId
      let lambdaPolicyStatementId = _this._generateAuthorizerStatementId(functionName);

      params = {
        FunctionName: functionName,
        Qualifier:    _this.evt.options.stage
      };

      return _this.provider.request('Lambda', 'getPolicy', params, _this.evt.options.stage, region)
        .then(function(data) {

          lambdaPolicy = JSON.parse(data.Policy);

          for (let i = 0; i < lambdaPolicy.Statement.length; i++) {
            statement = lambdaPolicy.Statement[i];
            if (statement.Sid && statement.Sid === lambdaPolicyStatementId) break;
          }

          if (!statement) return BbPromise.resolve();

          params.StatementId = lambdaPolicyStatementId;

          return _this.provider.request('Lambda', 'removePermission', params, _this.evt.options.stage, region)
            .then(function(data) {

              SUtils.sDebug(
                '"'
                + _this.evt.options.stage + ' - '
                + region
                + '": '
                + 'removed existing lambda access policy statement for this authorizer');
            })
        })
        .catch(function(error) {});
    }
  }

  return( EndpointDeployApiGateway );
};