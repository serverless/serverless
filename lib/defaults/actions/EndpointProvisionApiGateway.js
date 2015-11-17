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
    _this.Lambda         = require('../../utils/aws/ApiGateway')(awsConfig);

    return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._fetchDeployedLambdas)
        .then(_this._findOrCreateApi)
        .then(_this._getApiResources)
        .then(_this._buildEndpoints)
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

      let params = {
        restApiId: _this.evt.deployRegion.restApiId /* required */
      };

      // Show existing REST API
      return _this.ApiGateway.getRestApiPromised(params)
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

      let params = {
        limit: 500
      };

      // List all REST APIs
      return _this.ApiGateway.getRestApisPromised(params)
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

              let params = {
                name: apiName, /* required */
                description: _this.Jaws._projectJson.description ? _this.Jaws._projectJson.description : 'A REST API for a JAWS project.'
              };

              return _this.ApiGateway.createRestApiPromised(params)
                  .then(function (response) {

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

    let params = {
      restApiId: _this.evt.deployRegion.restApiId, /* required */
      limit: 500
    };

    // List all Resources for this REST API
    return _this.ApiGateway.getResourcesPromised(params)
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
          resourcePath,
          resourceIndex;

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

      let params = {
        parentId:  _this.evt.apiParentResourceId, /* required */
        pathPart:  eResource, /* required */
        restApiId: _this.evt.deployRegion.restApiId /* required */
      };

      // Create Resource
      return _this.ApiGateway.createResourcePromised(params)
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

    let params = {
      httpMethod: endpoint.Method, /* required */
      resourceId: _this.evt.currentResource.id, /* required */
      restApiId:  _this.evt.deployRegion.restApiId /* required */
    };

    return _this.ApiGateway.getMethodPromised(params)
        .then(function(response) {

          // Method exists.  Delete and update it.

          let params = {
            httpMethod: endpoint.Method, /* required */
            resourceId: _this.evt.currentResource.id, /* required */
            restApiId:  _this.evt.deployRegion.restApiId /* required */
          };

          return _this.AwsApiGateway.deleteMethodPromised(params)
              .then(function() {

                let params = {
                  authorizationType:  endpoint.AuthorizationType, /* required */
                  httpMethod:         endpoint.Method, /* required */
                  resourceId:         _this.evt.currentResource.id, /* required */
                  restApiId:          _this.evt.deployRegion.restApiId, /* required */
                  apiKeyRequired:     endpoint.ApiKeyRequired,
                  requestModels:      endpoint.RequestModels,
                  requestParameters:  requestParameters
                };

                return _this.AwsApiGateway.putMethodPromised(params);
              });
        }, function(error) {

          // Method does not exist.  Create it.

          let params = {
            authorizationType:  endpoint.AuthorizationType, /* required */
            httpMethod:         endpoint.Method, /* required */
            resourceId:         _this.evt.currentResource.id, /* required */
            restApiId:          _this.evt.deployRegion.restApiId, /* required */
            apiKeyRequired:     endpoint.ApiKeyRequired,
            requestModels:      endpoint.RequestModels,
            requestParameters:  requestParameters
          };

          return _this.AwsApiGateway.putMethodPromised(params);
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
        });
  }

  /**
   * Create Endpoint Integration
   */

  _createEndpointIntegration() {

    let _this           = this,
        endpoint        = _this.evt.currentFunction.cloudFormation.apiGateway.Endpoint;

    // Create Integration
    if (_this.evt.currentResource.cloudFormation.lambda) {

      // Find Deployed Lambda and its function name
      let cfLogicalResourceId = _this.Lambda.sGetLambdaName(_this.evt.currentFunction),
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

      // Save current lambda to event
      _this.evt.currentLambda = lambda;

    } else {
      return BbPromise.reject(new JawsError('JAWS API Gateway integration currently works with Lambdas only.'));
    }

    let params = {
      httpMethod:         endpoint.Method, /* required */
      resourceId:         _this.evt.currentResource.id, /* required */
      restApiId:          _this.evt.deployRegion.restApiId, /* required */
      type:               'AWS', /* required */
      cacheKeyParameters: endpoint.CacheKeyParameters || [],
      cacheNamespace:     endpoint.CacheNamespace || null,
      // Due to a bug in API Gateway reported here: https://github.com/awslabs/aws-apigateway-swagger-importer/issues/41
      // Specifying credentials within API Gateway causes extra latency (~500ms)
      // Until API Gateway is fixed, we need to make a separate call to Lambda to add credentials to API Gateway
      // Once API Gateway is fixed, we can use this in credentials:
      // _this._regionJson.iamRoleArnApiGateway
      credentials:        null,
      //integrationHttpMethod: 'STRING_VALUE', // Add support for this soon
      requestParameters:  endpoint.RequestParameters || {},
      requestTemplates:   endpoint.RequestTemplates  || {},
      uri:                'arn:aws:apigateway:' // Make ARN for apigateway - lambda
                          + _this._regionJson.region
                          + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
                          + _this._regionJson.region
                          + ':'
                          + _this._awsAccountNumber
                          + ':function:'
                          + lambda.PhysicalResourceId
                          + '/invocations'
    };

    // Create Integration
    return _this.AwsApiGateway.putIntegrationPromised(params)
        .then(function(response) {

          // Save integration
          _this.evt.currentIntegration = response;

          JawsUtils.jawsDebug(
              '"'
              + _this.evt.stage + ' - '
              + _this.evt.deployRegion.region
              + ' - ' + endpoint.Path + '": '
              + 'created integration with the type: '
              + endpoint.Type);
        })
        .catch(function(error) {
          throw new JawsError(
              error.message,
              JawsError.errorCodes.UNKNOWN);
        });
  }

  /**
   * Create Endpoint Method Response
   */

  _createEndpointMethodResponses() {

    let _this           = this,
        endpoint        = _this.evt.currentFunction.cloudFormation.apiGateway.Endpoint;

    return BbPromise.try(function() {

          // Collect Response Keys
          if (endpoint.Responses) return Object.keys(endpoint.Responses);
          else return [];

        })
        .each(function(responseKey) {

          // Iterate through each response to be created

          let thisResponse       = endpoint.Responses[responseKey];
          let responseParameters = {};
          let responseModels     = {};

          // If Response Params, add them
          if (thisResponse.responseParameters) {
            // Format Response Parameters per APIG API's Expectations
            for (let prop in thisResponse.responseParameters) {
              responseParameters[prop] = true;
            }
          }

          // If Request models, add them
          if (thisResponse.responseModels) {
            // Format Response Models per APIG API's Expectations
            for (let name in thisResponse.responseModels) {
              let value            = thisResponse.responseModels[name];
              responseModels[name] = value;
            }
          }

          let params = {
            httpMethod:         endpoint.Method, /* required */
            resourceId:         _this.evt.currentResource.id, /* required */
            restApiId:          _this.evt.deployRegion.restApiId, /* required */
            statusCode:         thisResponse.statusCode, /* required */
            responseModels:     responseModels,
            responseParameters: responseParameters
          };

          // Create Method Response
          return _this.ApiGateway.putMethodResponsePromised(params)
              .then(function() {

                JawsUtils.jawsDebug(
                    '"'
                    + _this.evt.stage + ' - '
                    + _this.evt.deployRegion.region
                    + ' - ' + endpoint.Path + '": '
                    + 'created method response');

              })
              .catch(function(error) {
                throw new JawsError(error.message);
              });
        });
  }

  /**
   * Create Method Integration Response
   */

  _createEndpointMethodIntegResponses() {

    let _this           = this,
        endpoint        = _this.evt.currentFunction.cloudFormation.apiGateway.Endpoint;

    return BbPromise.try(function() {

          // Collect Response Keys
          if (endpoint.Responses) return Object.keys(endpoint.Responses);
          else return [];
        })
        .each(function(responseKey) {

          let thisResponse       = endpoint.Responses[responseKey];

          // Add Response Parameters
          let responseParameters = thisResponse.responseParameters || {};

          // Add Response Templates
          let responseTemplates = thisResponse.responseTemplates || {};

          // Add SelectionPattern
          let selectionPattern = thisResponse.selectionPattern || (responseKey === 'default' ? null : responseKey);

          let params = {
            httpMethod:         endpoint.Method, /* required */
            resourceId:         _this.evt.currentResource.id, /* required */
            restApiId:          _this.evt.deployRegion.restApiId, /* required */
            statusCode:         thisResponse.statusCode, /* required */
            responseParameters: responseParameters,
            responseTemplates:  responseTemplates,
            selectionPattern:   selectionPattern,
          };

          // Create Integration Response
          return _this.ApiGateway.putIntegrationResponsePromised(params)
              .then(function() {
                JawsCli.log(
                    'Endpoint Deployer:  "'
                    + _this._stage
                    + ' - '
                    + _this._regionJson.region
                    + ' - '
                    + endpoint.Path
                    + '": '
                    + 'created method integration response');
              }).catch(function(error) {
                throw new JawsError(
                    error.message,
                    JawsError.errorCodes.UNKNOWN);
              });
        });
  }

  /**
   * Manage Lambda Access Policy
   */

  _manageLambdaAccessPolicy() {

    let _this           = this;

    // If method integration is not for a lambda, skip
    if (!_this.evt.currentLambda) return Promise.resolve();

    return _this._getLambdaAccessPolicy()
        .bind(_this)
        .then(_this._removeLambdaAccessPolicy)
        .then(_this._updateLambdaAccessPolicy);
  }

  /**
   * Get Lambda Access Policy
   * - Since specifying credentials when creating the Method Integration results in ~500ms
   * - of extra latency, this function updates the lambda's access policy instead
   * - to grant API Gateway permission.  This is how the API Gateway console does it.
   * - But this is not finished and the "getPolicy" method in the SDK is broken, so this
   * - is currently impossible to implement.
   */

  _getLambdaAccessPolicy() {

    let _this           = this;

    let params = {
      FunctionName: _this.evt.currentLambda.name, /* required */
      //Qualifier: 'STRING_VALUE' // TODO: Implement this
    };

    return _this.Lambda.getPolicyPromised(params)
        .then(function(data) {
          _this.evt.currentLambdaPolicy = JSON.parse(data.Policy);
        })
        .catch(function(error) {});
  }

  /**
   * Remove Lambda Access Policy
   */

  _removeLambdaAccessPolicy() {

    let _this       = this,
        endpoint    = _this.evt.currentFunction.cloudFormation.apiGateway.Endpoint,
        statement;

    if (_this.evt.currentLambdaPolicy) {

      let policy = _this.evt.currentLambdaPolicy;

      for (let i = 0; i < policy.Statement.length; i++) {
        statement = policy.Statement[i];
        if (statement.Sid && statement.Sid === 'jaws-apigateway-access') continue;
        // TODO: Throw error
      }
    }

    if (!statement) return Promise.resolve(endpoint);

    return AWSUtils.lambdaRemovePermission(
        _this.Jaws._awsProfile,
        _this.evt.currentRegion.region,
        _this.evt.currentLambda.PhysicalResourceId,
        'jaws-apigateway-access')
        .then(function(data) {

          JawsCli.log(
              'Endpoint Deployer:  "'
              + _this._stage
              + ' - '
              + _this._regionJson.region
              + ' - '
              + endpoint.apiGateway.cloudFormation.Path
              + '": removed existing lambda access policy statement');

          return endpoint;
        })
        .catch(function(error) {
          console.log(error);
          return endpoint;
        });
  }

  /**
   *
   * @param endpoint
   * @returns {Promise}
   * @private
   */
  _updateLambdaAccessPolicy(endpoint) {

    let _this = this;

    // Sanitize Path - Remove first and last slashes, if any
    endpoint.apiGateway.cloudFormation.Path = endpoint.apiGateway.cloudFormation.Path.split('/');
    endpoint.apiGateway.cloudFormation.Path = endpoint.apiGateway.cloudFormation.Path.join('/');

    // Create new access policy statement
    let statement          = {};
    statement.Action       = 'lambda:InvokeFunction';
    statement.FunctionName = endpoint.apiGateway.apig.lambda.PhysicalResourceId;
    statement.Principal    = 'apigateway.amazonaws.com';
    statement.StatementId  = 'jaws-apigateway-access';
    statement.SourceArn    = 'arn:aws:execute-api:'
        + _this._regionJson.region
        + ':'
        + _this._awsAccountNumber
        + ':'
        + _this._restApiId
        + '/*/'
        + endpoint.apiGateway.cloudFormation.Method
        + '/'
        + endpoint.apiGateway.cloudFormation.Path;

    return AWSUtils.lambdaAddPermission(
        _this.Jaws._awsProfile,
        _this._regionJson.region,
        statement)
        .then(function(data) {
          JawsCli.log(
              'Endpoint Deployer:  "'
              + _this._stage
              + ' - '
              + _this._regionJson.region
              + ' - '
              + endpoint.apiGateway.cloudFormation.Path
              + '": created new lambda access policy statement');
          return endpoint;
        })
        .catch(function(error) {
          console.log(error);
          return endpoint;
        });
  }
}

module.exports = EndpointProvisionApiGateway;