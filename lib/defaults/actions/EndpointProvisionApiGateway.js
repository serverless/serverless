'use strict';

/**
 * Action: Endpoint Provision ApiGateway
 */

const JawsPlugin    = require('../../JawsPlugin'),
    JawsError       = require('../../jaws-error'),
    JawsCLI         = require('../../utils/cli'),
    JawsUtils       = require('../../utils/index'),
    AWSUtils        = require('../../utils/aws'),
    AwsApiGateway   = require('../../utils/aws/ApiGateway'),
    BbPromise       = require('bluebird'),
    path            = require('path'),
    os              = require('os');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class EndpointProvisionApiGateway extends JawsPlugin {

  /**
   * Constructor
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Get Name
   * Define your plugins name
   * @returns {string}
   */

  static getName() {
    return 'jaws.core.' + EndpointProvisionApiGateway.name;
  }

  /**
   * Register Actions
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.endpointProvisionApiGateway.bind(this), {
      handler:       'endpointProvisionApiGateway',
      description:   'Provision one or multiple endpoints',
    });
    return Promise.resolve();
  }

  /**
   * Endpoint Provision ApiGateway
   * @returns {Promise.<T>}
   */

  endpointProvisionApiGateway() {

    let _this = this;

    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._fetchDeployedLambdas)
        .then(_this._findOrCreateApi)
        .then(_this._getApiResources)
        .then(_this._buildEndpoints)
  }

  _validate() {
    return Promise.resolve();
  }

  /**
   * Fetch deployed lambdas in CF stack
   * @private
   */

  _fetchDeployedLambdas() {

    let _this = this;

    return AWSUtils.cfGetLambdaResourceSummaries(
        _this.Jaws._awsProfile,
        _this.Jaws.ctx.currentRegion.region,
        AWSUtils.cfGetLambdasStackName(
            _this.Jaws.ctx.stage,
            _this.Jaws._projectJson.name)
        )
        .then(lambdas => {
          _this.Jaws.ctx.deployedLambdas = lambdas;
        });
  }

  /**
   * Find Or Create API
   * @returns {*|Promise.<T>}
   * @private
   */

  _findOrCreateApi() {

    let _this = this;

    // Check Project's jaws.json for restApiId, otherwise create an api
    if (_this.Jaws.ctx.currentRegion.restApiId) {

      // Show existing REST API
      return this.ApiClient.showRestApi(_this.Jaws.ctx.currentRegion.restApiId)
          .then(function(response) {

            _this.Jaws.ctx.currentRegion.restApiId = response.id;
            JawsCli.log(
                '"'
                + _this.Jaws.ctx.stage + ' - '
                + _this.Jaws.ctx.currentRegion.region
                + '": found existing REST API on AWS API Gateway with ID: '
                + response.id);
          });

    } else {

      // List all REST APIs
      return AwsApiGateway.getRestApis()
          .then(function(response) {

            // Find REST API w/ same name as project
            for (let i = 0; i < response.items.length;i++) {

              if (response.items[i].name === _this.Jaws._projectJson.name) {
                _this.Jaws.ctx.currentRegion.restApiId = response.items[i].id;

                // Save restApiId to jaws.json for future use
                JawsUtils.saveRegionalApi(
                    _this.Jaws._projectJson,
                    _this.Jaws.ctx.currentRegion.region,
                    _this.Jaws.ctx.currentRegion.restApiId,
                    _this.Jaws._projectRootPath
                );

                JawsUtils.jawsDebug(
                    '"'
                    + _this.Jaws.ctx.stage + ' - '
                    + _this.Jaws.ctx.currentRegion.region
                    + '": found existing REST API on AWS API Gateway with ID: '
                    + _this.Jaws.ctx.currentRegion.restApiId);
                break;
              }
            }

            // If no REST API found, create one
            if (!_this.Jaws.ctx.currentRegion.restApiId) {

              let apiName = _this.Jaws._projectJson.name;
              apiName = apiName.substr(0, 1023); // keep the name length below the limits

              return AwsApiGateway.createRestApi(
                  apiName,
                  _this.Jaws._projectJson.description ? _this.Jaws._projectJson.description : 'A REST API for a JAWS project.'
              ).then(function (response) {

                _this.Jaws.ctx.currentRegion.restApiId = response.id;

                // Save to jaws.json
                JawsUtils.saveRegionalApi(
                    _this.Jaws._projectJson,
                    _this.Jaws.ctx.currentRegion.region,
                    _this.Jaws.ctx.currentRegion.restApiId,
                    _this.Jaws._projectRootPath
                );

                JawsUtils.jawsDebug(
                    '"'
                    + _this.Jaws.ctx.stage + ' - '
                    + _this.Jaws.ctx.currentRegion.region
                    + '": created a new REST API on AWS API Gateway with ID: '
                    + response.id);
              });
            }
          });
    }
  }

  /**
   * Get API Resources
   * @returns {Promise}
   * @private
   */

  _getApiResources() {

    let _this = this;

    // List all Resources for this REST API
    return AwsApiGateway.getResources(_this.Jaws.ctx.currentRegion.restApiId)
        .then(function(response) {

          _this.Jaws.ctx.apiResources = response.items;

          // Get Parent Resource ID
          for (let i = 0; i < _this.Jaws.ctx.apiResources.length; i++) {
            if (_this.Jaws.ctx.apiResources[i].path === '/') {
              _this.Jaws.ctx.apiParentResourceId = _this.Jaws.ctx.apiResources[i].id;
            }
          }

          JawsUtils.jawsDebug(
              '"'
              + _this.Jaws.ctx.stage + ' - '
              + _this.Jaws.ctx.currentRegion.region
              + '": found '
              + _this.Jaws.ctx.apiResources.length
              + ' existing Resources on API Gateway');
        });
  }

  /**
   * Build Endpoints
   * @returns {Promise}
   * @private
   */

  _buildEndpoints() {

    let _this = this;

    return BbPromise.try(function() {
      return _this.Jaws.ctx.functions;
    }).each(function(currentFunction) {

      _this.Jaws.ctx.currentFunction = currentFunction;

      return _this._createEndpointResources()
      .bind(_this)
      .then(_this._createEndpointMethod)
      .then(_this._createEndpointIntegration)
      //.then(_this._createEndpointIntegration)
      //.then(_this._manageLambdaAccessPolicy)
      //.then(_this._createEndpointMethodResponses)
      //.then(_this._createEndpointMethodIntegResponses)
      //.then(function() {
      //
      //  // Clean-up hack
      //  // TODO figure out how "apig" temp property is being written to the awsm's json and remove that
      //  if (endpoint.apiGateway.apig) delete endpoint.apiGateway.apig;
      //});
    });
  }

  /**
   * Create Endpoint Resources
   * @returns {Promise}
   * @private
   */

  _createEndpointResources() {

    let _this      = this,
        endpoint   = _this.Jaws.ctx.currentFunction.cloudFormation.apiGateway.Endpoint,
        eResources = endpoint.Path.split('/');

    /**
     * Private Function to find resource
     * @param resource
     * @param parent
     * @returns {*}
     */

    let findEndpointResource = function(resource, parent) {

      // Replace slashes in resource
      resource  = resource.replace(/\//g, '');
      let index = eResources.indexOf(resource),
          resourcePath, resourceIndex;

      if (parent) {
        index    = index - 1;
        resource = eResources[index];
      }

      if (index < 0) {
        resourcePath = '/';
      } else {
        resourceIndex = endpoint.Path.indexOf(resource);
        resourcePath  = '/' + endpoint.Path.substring(0, resourceIndex + resource.length);
      }

      // If resource has already been created, skip it
      for (let i = 0; i < _this.Jaws.ctx.apiResources.length; i++) {

        // Check if path matches, in case there are duplicate resources (users/list, org/list)
        if (_this.Jaws.ctx.apiResources[i].path === resourcePath) {
          return _this.Jaws.ctx.apiResources[i];
        }
      }
    };

    return BbPromise.try(function() {

      return eResources;

    }).each(function(eResource) {

      // Remove slashes in resource
      eResource = eResource.replace(/\//g, '');

      // If resource exists, skip it
      let resource = findEndpointResource(eResource);
      if (resource) return resource;

      // Get Parent Resource
      _this.Jaws.ctx.apiParentResourceId = findEndpointResource(eResource, true).id;

      // Create Resource
      return AwsApiGateway.createResource(
          _this.Jaws.ctx.currentRegion.restApiId,
          _this.Jaws.ctx.apiParentResourceId,
          eResource
          )
          .then(function(response) {

            // Add resource to _this.resources and callback
            _this.Jaws.ctx.apiResources.push(response);

            JawsUtils.jawsDebug(
                '"'
                + _this.Jaws.ctx.stage + ' - '
                + _this.Jaws.ctx.currentRegion.region
                + ' - ' + endpoint.Path + '": '
                + 'created resource: '
                + response.pathPart);
          });

    }).then(function() {

      // Attach the last resource to endpoint for later use
      let endpointResource           = endpoint.Path.split('/').pop().replace(/\//g, '');
      _this.Jaws.ctx.currentResource = findEndpointResource(endpointResource);

    });
  }

  /**
   * Create Endpoint Method
   * @returns {Promise}
   * @private
   */

  _createEndpointMethod() {

    let _this      = this,
        endpoint   = _this.Jaws.ctx.currentFunction.cloudFormation.apiGateway.Endpoint,
        requestParameters = {};


    // If Request Params, add them
    if (endpoint.RequestParameters) {

      // Format them per APIG API's Expectations
      for (let prop in endpoint.RequestParameters) {
        let requestParam                = endpoint.RequestParameters[prop];
        requestParameters[requestParam] = true;
      }
    }

    return AwsApiGateway.getMethod(
        _this.Jaws.ctx.currentRegion.restApiId,
        _this.Jaws.ctx.currentResource.id,
        endpoint.Method
        )
        .then(function(response) {

          // Method exists.  Delete and update it.

          return AwsApiGateway.deleteMethod(
              _this.Jaws.ctx.currentRegion.restApiId,
              _this.Jaws.ctx.currentResource.id,
              endpoint.Method
              )
              .then(function() {

                return AwsApiGateway.putMethod(
                    _this.Jaws.ctx.currentRegion.restApiId,
                    _this.Jaws.ctx.currentResource.id,
                    endpoint.Method,
                    endpoint.RequestModels,
                    requestParameters,
                    endpoint.ApiKeyRequired,
                    endpoint.AuthorizationType);
              });
        }, function(error) {

          // Method does not exist.  Create it.

          return AwsApiGateway.putMethod(
              _this.Jaws.ctx.currentRegion.restApiId,
              _this.Jaws.ctx.currentResource.id,
              endpoint.Method,
              endpoint.RequestModels,
              requestParameters,
              endpoint.ApiKeyRequired,
              endpoint.AuthorizationType);
        })
        .delay(250) // API Gateway takes time to delete Methods.  Might have to increase this.
        .then(function(response) {

          JawsUtils.jawsDebug(
              '"'
              + _this.Jaws.ctx.stage + ' - '
              + _this.Jaws.ctx.currentRegion.region
              + ' - ' + endpoint.Path + '": '
              + 'created method: '
              + endpoint.Method);

          return;
        });
  }

  /**
   * Create Endpoint Integration
   * @returns {Promise}
   * @private
   */

  _createEndpointIntegration() {

    let _this           = this,
        endpoint        = _this.Jaws.ctx.currentFunction.cloudFormation.apiGateway.Endpoint,
        integrationBody = {};

    // Create Integration
    if (_this.Jaws.ctx.currentResource.cloudFormation.lambda) {

      // Find Deployed Lambda and its function name
      let cfLogicalResourceId = JawsUtils.getLambdaName(_this.Jaws.ctx.currentFunction),
          lambda              = null;

      for (let i = 0; i < _this.Jaws.ctx.deployedLambdas.length; i++) {
        if (_this.Jaws.ctx.deployedLambdas[i].LogicalResourceId === cfLogicalResourceId) {
          lambda = _this.Jaws.ctx.deployedLambdas[i];
        }
      }

      // If no deployed lambda found, throw error
      if (!lambda) {
        return Promise.reject(new JawsError('Could not find a lambda deployed in this stage/region with this function name: '
            + cfLogicalResourceId));
      }
      _this.Jaws.ctx.currentLambda = lambda;

      // Create integration body
      integrationBody = {
        type:              'AWS',
        httpMethod:        'POST', // Must be post for lambda
        authorizationType: 'none',
        uri:               'arn:aws:apigateway:' // Make ARN for apigateway - lambda
                           + _this._regionJson.region
                           + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
                           + _this._regionJson.region
                           + ':'
                           + _this._awsAccountNumber
                           + ':function:'
                           + lambda.PhysicalResourceId
                           + '/invocations',

        // Due to a bug in API Gateway reported here: https://github.com/awslabs/aws-apigateway-swagger-importer/issues/41
        // Specifying credentials within API Gateway causes extra latency (~500ms)
        // Until API Gateway is fixed, we need to make a seperate call to Lambda to add credentials to API Gateway
        // Once API Gateway is fixed, we can use this in credentials:
        // _this._regionJson.iamRoleArnApiGateway
        credentials:        null,
        requestParameters:  endpoint.apiGateway.cloudFormation.RequestParameters || {},
        requestTemplates:   endpoint.apiGateway.cloudFormation.RequestTemplates || {},
        cacheNamespace:     endpoint.apiGateway.cloudFormation.CacheNamespace || null,
        cacheKeyParameters: endpoint.apiGateway.cloudFormation.CacheKeyParameters || [],
      };

    } else {
      return Promise.reject(new JawsError('JAWS API Gateway integration currently works with Lambdas only.'));
    }

    // Create Integration
    return _this.ApiClient.putIntegration(
        _this._restApiId,
        endpoint.apiGateway.apig.resource.id,
        endpoint.apiGateway.cloudFormation.Method,
        integrationBody)
        .then(function(response) {

          // Save integration to apig property
          endpoint.apiGateway.apig.integration = response;
          JawsCli.log(
              'Endpoint Deployer:  "'
              + _this._stage + ' - '
              + _this._regionJson.region
              + ' - ' + endpoint.apiGateway.cloudFormation.Path + '": '
              + 'created integration with the type: '
              + endpoint.apiGateway.cloudFormation.Type);
          return endpoint;
        })
        .catch(function(error) {
          throw new JawsError(
              error.message,
              JawsError.errorCodes.UNKNOWN);
        });
  }
}

module.exports = EndpointProvisionApiGateway;