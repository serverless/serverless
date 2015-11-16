'use strict';

/**
 * Action: Endpoint Provision ApiGateway
 * - Provisions API Gateway endpoints on the AWS account.
 * - Handles one region only.  The FunctionDeploy Action processes multiple regions by calling this multiple times.
 */

const JawsPlugin    = require('../../JawsPlugin'),
    JawsError       = require('../../jaws-error'),
    JawsCLI         = require('../../utils/cli'),
    JawsUtils       = require('../../utils/index'),
    BbPromise       = require('bluebird'),
    path            = require('path'),
    fs              = require('fs'),
    os              = require('os');

// Promisify fs module.
BbPromise.promisifyAll(fs);

class EndpointProvisionApiGateway extends JawsPlugin {

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
    return 'jaws.core.' + EndpointProvisionApiGateway.name;
  }

  /**
   * Register Actions
   */

  registerActions() {
    this.Jaws.addAction(this.endpointProvisionApiGateway.bind(this), {
      handler:       'endpointProvisionApiGateway',
      description:   'Provision one or multiple endpoints on API Gateway',
    });
    return BbPromise.resolve();
  }

  /**
   * Endpoint Provision ApiGateway
   */

  endpointProvisionApiGateway(evt) {

    let _this = this;
    _this.evt = evt;

    // Load AWS Service Instances
    let awsConfig = {
      region:          _this.evt.deployRegion.region,
      accessKeyId:     _this.Jaws.accessKeyId,
      secretAccessKey: _this.Jaws.secretAccessKey,
    };
    _this.CloudFormation = require('../../utils/aws/CloudFormation')(awsConfig);
    _this.ApiGateway     = require('../../utils/aws/ApiGateway')(awsConfig);

    return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._fetchDeployedLambdas);

        // TODO: Austen left off here
        //.then(_this._findOrCreateApi)
        //.then(_this._getApiResources)
        //.then(_this._buildEndpoints)
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare() {
    return BbPromise.resolve();
  }

  /**
   * Fetch deployed lambdas in CF stack
   * @private
   */

  _fetchDeployedLambdas() {

    let _this = this;

    return _this.CloudFormation.sGetLambdasStackName(
        _this.evt.stage,
        _this.Jaws._projectJson.name
        )
        .bind(_this)
        .then(_this.CloudFormation.sGetLambdaResourceSummaries)
        .then(lambdas => {
          _this.evt.deployedLambdas = lambdas;
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
    if (_this.evt.deployRegion.restApiId) {

      // Show existing REST API
      return this.ApiClient.showRestApi(_this.evt.deployRegion.restApiId)
          .then(function(response) {

            _this.evt.deployRegion.restApiId = response.id;
            JawsCli.log(
                '"'
                + _this.evt.stage + ' - '
                + _this.evt.deployRegion.region
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
                _this.evt.deployRegion.restApiId = response.items[i].id;

                // Save restApiId to jaws.json for future use
                JawsUtils.saveRegionalApi(
                    _this.Jaws._projectJson,
                    _this.evt.deployRegion.region,
                    _this.evt.deployRegion.restApiId,
                    _this.Jaws._projectRootPath
                );

                JawsUtils.jawsDebug(
                    '"'
                    + _this.evt.stage + ' - '
                    + _this.evt.deployRegion.region
                    + '": found existing REST API on AWS API Gateway with ID: '
                    + _this.evt.deployRegion.restApiId);
                break;
              }
            }

            // If no REST API found, create one
            if (!_this.evt.deployRegion.restApiId) {

              let apiName = _this.Jaws._projectJson.name;
              apiName = apiName.substr(0, 1023); // keep the name length below the limits

              return AwsApiGateway.createRestApi(
                  apiName,
                  _this.Jaws._projectJson.description ? _this.Jaws._projectJson.description : 'A REST API for a JAWS project.'
              ).then(function (response) {

                _this.evt.deployRegion.restApiId = response.id;

                // Save to jaws.json
                JawsUtils.saveRegionalApi(
                    _this.Jaws._projectJson,
                    _this.evt.deployRegion.region,
                    _this.evt.deployRegion.restApiId,
                    _this.Jaws._projectRootPath
                );

                JawsUtils.jawsDebug(
                    '"'
                    + _this.evt.stage + ' - '
                    + _this.evt.deployRegion.region
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
    return AwsApiGateway.getResources(_this.evt.deployRegion.restApiId)
        .then(function(response) {

          _this.evt.apiResources = response.items;

          // Get Parent Resource ID
          for (let i = 0; i < _this.evt.apiResources.length; i++) {
            if (_this.evt.apiResources[i].path === '/') {
              _this.evt.apiParentResourceId = _this.evt.apiResources[i].id;
            }
          }

          JawsUtils.jawsDebug(
              '"'
              + _this.evt.stage + ' - '
              + _this.evt.deployRegion.region
              + '": found '
              + _this.evt.apiResources.length
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
      return _this.evt.functions;
    }).each(function(currentFunction) {

      _this.evt.currentFunction = currentFunction;

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
        endpoint   = _this.evt.currentFunction.cloudFormation.apiGateway.Endpoint,
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
      for (let i = 0; i < _this.evt.apiResources.length; i++) {

        // Check if path matches, in case there are duplicate resources (users/list, org/list)
        if (_this.evt.apiResources[i].path === resourcePath) {
          return _this.evt.apiResources[i];
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
      _this.evt.apiParentResourceId = findEndpointResource(eResource, true).id;

      // Create Resource
      return AwsApiGateway.createResource(
          _this.evt.deployRegion.restApiId,
          _this.evt.apiParentResourceId,
          eResource
          )
          .then(function(response) {

            // Add resource to _this.resources and callback
            _this.evt.apiResources.push(response);

            JawsUtils.jawsDebug(
                '"'
                + _this.evt.stage + ' - '
                + _this.evt.deployRegion.region
                + ' - ' + endpoint.Path + '": '
                + 'created resource: '
                + response.pathPart);
          });

    }).then(function() {

      // Attach the last resource to endpoint for later use
      let endpointResource           = endpoint.Path.split('/').pop().replace(/\//g, '');
      _this.evt.currentResource = findEndpointResource(endpointResource);

    });
  }

  /**
   * Create Endpoint Method
   * @returns {Promise}
   * @private
   */

  _createEndpointMethod() {

    let _this      = this,
        endpoint   = _this.evt.currentFunction.cloudFormation.apiGateway.Endpoint,
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
        _this.evt.deployRegion.restApiId,
        _this.evt.currentResource.id,
        endpoint.Method
        )
        .then(function(response) {

          // Method exists.  Delete and update it.

          return AwsApiGateway.deleteMethod(
              _this.evt.deployRegion.restApiId,
              _this.evt.currentResource.id,
              endpoint.Method
              )
              .then(function() {

                return AwsApiGateway.putMethod(
                    _this.evt.deployRegion.restApiId,
                    _this.evt.currentResource.id,
                    endpoint.Method,
                    endpoint.RequestModels,
                    requestParameters,
                    endpoint.ApiKeyRequired,
                    endpoint.AuthorizationType);
              });
        }, function(error) {

          // Method does not exist.  Create it.

          return AwsApiGateway.putMethod(
              _this.evt.deployRegion.restApiId,
              _this.evt.currentResource.id,
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
              + _this.evt.stage + ' - '
              + _this.evt.deployRegion.region
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
        endpoint        = _this.evt.currentFunction.cloudFormation.apiGateway.Endpoint,
        integrationBody = {};

    // Create Integration
    if (_this.evt.currentResource.cloudFormation.lambda) {

      // Find Deployed Lambda and its function name
      let cfLogicalResourceId = JawsUtils.getLambdaName(_this.evt.currentFunction),
          lambda              = null;

      for (let i = 0; i < _this.evt.deployedLambdas.length; i++) {
        if (_this.evt.deployedLambdas[i].LogicalResourceId === cfLogicalResourceId) {
          lambda = _this.evt.deployedLambdas[i];
        }
      }

      // If no deployed lambda found, throw error
      if (!lambda) {
        return BbPromise.reject(new JawsError('Could not find a lambda deployed in this stage/region with this function name: '
            + cfLogicalResourceId));
      }
      _this.evt.currentLambda = lambda;

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
      return BbPromise.reject(new JawsError('JAWS API Gateway integration currently works with Lambdas only.'));
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