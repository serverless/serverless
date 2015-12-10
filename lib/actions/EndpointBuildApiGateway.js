'use strict';

/**
 * Action: Endpoint Build ApiGateway
 * - Creates API Gateway endpoints on the AWS account.
 * - Handles one endpoint only in one region.  The FunctionDeploy Action orchestrates this.
 */

const SPlugin       = require('../ServerlessPlugin'),
    SError          = require('../ServerlessError'),
    SUtils          = require('../utils/index'),
    BbPromise       = require('bluebird'),
    path            = require('path'),
    async           = require('async'),
    fs              = require('fs'),
    os              = require('os');

// Promisify fs module.
BbPromise.promisifyAll(fs);

class EndpointBuildApiGateway extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'serverless.core.' + EndpointBuildApiGateway.name;
  }

  /**
   * Register Actions
   */

  registerActions() {
    this.S.addAction(this.endpointBuildApiGateway.bind(this), {
      handler:     'endpointBuildApiGateway',
      description: 'Provision one or multiple endpoints on API Gateway',
    });
    return BbPromise.resolve();
  }

  /**
   * Endpoint Build ApiGateway
   */

  endpointBuildApiGateway(evt) {
    let builder = new Builder(this.S);
    return builder.build(evt);
  }
}

/**
 * Builder
 * - Necessary for this action to run concurrently
 */

class Builder {

  constructor(S) {
    this.S = S;
  }

  build(evt) {

    let _this = this;

    // Define useful variables
    _this.awsAccountNumber;
    _this.resource;
    _this.resourceParent;
    _this.prevIntegration;
    _this.integration;
    _this.lambda;
    _this.apiResources;

    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._fetchDeployedLambda)
        .then(_this._getApiResources)
        .then(_this._createEndpointResources)
        .then(_this._createEndpointMethod)
        .then(_this._createEndpointIntegration)
        .then(_this._createEndpointMethodResponses)
        .then(_this._createEndpointMethodIntegResponses)
        .then(_this._manageLambdaAccessPolicy)
        .then(function() {

          evt.endpoint.url = 'https://'
              + evt.region.restApiId
              + '.execute-api.'
              +  evt.region.region
              + '.amazonaws.com/'
              + evt.stage
              + evt.endpoint.path;

          SUtils.sDebug(
              '"'
              + evt.stage
              + '" successfully built endpoint on API Gateway in the region "'
              + evt.region.region
              + '". Access it via '
              + evt.endpoint.method
              + ' @ '
              + evt.endpoint.url);

          return evt;
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {

    let _this = this;

    // Get AWS Account Number
    _this.awsAccountNumber = evt.region.iamRoleArnLambda.replace('arn:aws:iam::', '').split(':')[0];

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };

    _this.CloudFormation = require('../utils/aws/CloudFormation')(awsConfig);
    _this.ApiGateway     = require('../utils/aws/ApiGateway')(awsConfig);
    _this.Lambda         = require('../utils/aws/Lambda')(awsConfig);

    // Validate and sanitize endpoint attributes
    if (!evt.endpoint.path) {
      throw new SError('Endpoint does not have a "path" property');
    }
    if (!evt.endpoint.method) {
      throw new SError('Endpoint does not have a "method" property');
    }
    if (!evt.endpoint.authorizationType) {
      throw new SError('Endpoint does not have a "authorizationType" property');
    }
    if (typeof evt.endpoint.apiKeyRequired === 'undefined') {
      throw new SError('Endpoint does not have a "apiKeyRequired" property');
    }
    if (!evt.endpoint.requestTemplates) {
      throw new SError('Endpoint does not have a "requestTemplates" property');
    }
    if (!evt.endpoint.requestParameters) {
      throw new SError('Endpoint does not have a "requestParameters" property');
    }
    if (!evt.endpoint.responses) {
      throw new SError('Endpoint does not have a "responses" property');
    }

    // Sanitize path - Remove excessive forward slashes
    if (evt.endpoint.path.charAt(0) !== '/') evt.endpoint.path = '/' + evt.endpoint.path;
    if (evt.endpoint.path.charAt(evt.endpoint.path.length) === '/') evt.endpoint.path = evt.endpoint.path.slice(0, -1);

    // Sanitize method
    evt.endpoint.method = evt.endpoint.method.toUpperCase();

    return BbPromise.resolve(evt);
  }

  /**
   * Fetch Deployed Lambda
   * @private
   */

  _fetchDeployedLambda(evt) {

    let _this = this;
    let params = {
      FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.endpoint.function), /* required */
      Qualifier:    evt.stage
    };

    return _this.Lambda.getFunctionPromised(params)
        .then(function(data) {

          _this.deployedLambda = data.Configuration;

          // Prepare StatementId
          evt.endpoint.lambdaPolicyStatementId = ('s_apig' + evt.endpoint.path + '_' + evt.endpoint.method).replace(/\//g, '_');

          SUtils.sDebug(
              '"'
              + evt.stage + ' - '
              + evt.region.region
              + ' - ' + evt.endpoint.path
              + '": found the target lambda with function name:'
              + _this.deployedLambda.FunctionName);

          return evt;
        });
  }

  /**
   * Get API Resources
   * @returns {Promise}
   * @private
   */

  _getApiResources(evt) {

    let _this = this;

    let params = {
      restApiId: evt.region.restApiId, /* required */
      limit: 500
    };

    // List all Resources for this REST API
    return _this.ApiGateway.getResourcesPromised(params)
        .then(function(response) {

          _this.apiResources = response.items;

          SUtils.sDebug(
              '"'
              + evt.stage + ' - '
              + evt.region.region
              + ' - ' + evt.endpoint.path + '": found '
              + _this.apiResources.length
              + ' existing Resources on API Gateway');

          return evt;
        });
  }

  /**
   * Create Endpoint Resources
   */

  _createEndpointResources(evt) {

    let _this = this;

    /**
     * Find Parent
     * - We always want to provide the parent resource on the EVENT object.
     * - Here is a private, reusable function to find and add it
     */

    let findParent = function(resource) {

      let parentPath = resource.split('/');
      if (parentPath.length > 1) {
        parentPath.pop();
        parentPath = '/' + parentPath.join('/');
      } else {
        parentPath = '/';
      }

      for (let i = 0; i < _this.apiResources.length; i++) {
        if (_this.apiResources[i].path === parentPath) {
          _this.resourceParent = _this.apiResources[i];
          break;
        }
      }
    };


    // Check paths to see if resources need building
    for (let i = 0; i < _this.apiResources.length; i++) {
      if (_this.apiResources[i].path === evt.endpoint.path) {
        _this.resource = _this.apiResources[i];
        break;
      }
    }

    // If all Endpoint resources exist already, load parent resource, skip the rest of this function
    if (_this.resource) {
      findParent(_this.resource.path);

      SUtils.sDebug(
          '"'
          + evt.stage + ' - '
          + evt.region.region
          + ' - ' + evt.endpoint.path + '": '
          + '": no resources need to be created for this endpoint');

      return BbPromise.resolve(evt);
    }

    let eResources = evt.endpoint.path.split('/');
    eResources[0] = '/'; // Our split removes the initial '/' and leaves an empty string, replace it

    return new BbPromise(function(resolve, reject) {

      // Loop through each resource in this Endpoint and create it if it is missing.
      let incrementedPath = '';
      async.eachSeries(eResources, function(eResource, cb) {

        // Build the path w/ new resource on each iteration
        if (incrementedPath === '') {
          incrementedPath = eResource;
        } else if (incrementedPath === '/') {
          incrementedPath = incrementedPath + eResource;
        } else {
          incrementedPath = incrementedPath + '/' + eResource;
        }

        // If exists in APIG resources, skip this
        let parentPath = '';
        let resourceExists = false;

        for (let i = 0; i < _this.apiResources.length; i++) {
          // If incrementedPath exists in the API Resource path, store the longest string, this is the parent.
          if (incrementedPath.indexOf(_this.apiResources[i].path) !== -1) {
            if (_this.apiResources[i].path.length > parentPath.length) {
              _this.resourceParent = _this.apiResources[i];
            }
          }

          // Resource exists, save it to Event object, break loop
          if (_this.apiResources[i].path === incrementedPath) {
            resourceExists = true;
            continue;
          }
        }

        // Resource exists, skip this iteration
        if (resourceExists) return cb();

        // Resource doesn't exist, so make it
        let params = {
          parentId:  _this.resourceParent.id, /* required */
          pathPart:  eResource, /* required */
          restApiId: evt.region.restApiId /* required */
        };

        // Create Resource
        return _this.ApiGateway.createResourcePromised(params)
            .then(function(response) {

              // Save resource
              _this.resource = response;

              // Add resource to _this.resources and callback
              _this.apiResources.push(response);

              SUtils.sDebug(
                  '"'
                  + evt.stage + ' - '
                  + evt.region.region
                  + ' - ' + evt.endpoint.path + '": '
                  + 'created resource: '
                  + response.pathPart);

              // Return callback to iterate loop
              return cb();
            });
      }, function() {
        return resolve(evt);
      }); // async.eachSeries
    });
  }

  /**
   * Create Endpoint Method
   */

  _createEndpointMethod(evt) {

    let _this             = this,
        requestParameters = {};

    // If Request Params, add them
    if (evt.endpoint.RequestParameters) {

      // Format them per APIG API's Expectations
      for (let prop in evt.endpoint.requestParameters) {
        let requestParam                = evt.endpoint.requestParameters[prop];
        requestParameters[requestParam] = true;
      }
    }

    let params = {
      httpMethod: evt.endpoint.method, /* required */
      resourceId: _this.resource.id, /* required */
      restApiId:  evt.region.restApiId /* required */
    };

    return _this.ApiGateway.getMethodPromised(params)
        .then(function(response) {

          // Method exists.  Delete and recreate it.

          // First, save integration's Lambda aliasEndpoint, if any
          if (response.methodIntegration) {
            _this.prevIntegration = response.methodIntegration;
          }

          let params = {
            httpMethod: evt.endpoint.method, /* required */
            resourceId: _this.resource.id, /* required */
            restApiId:  evt.region.restApiId /* required */
          };

          return _this.ApiGateway.deleteMethodPromised(params)
              .then(function(response) {

                let params = {
                  authorizationType:  evt.endpoint.authorizationType, /* required */
                  httpMethod:         evt.endpoint.method, /* required */
                  resourceId:         _this.resource.id, /* required */
                  restApiId:          evt.region.restApiId, /* required */
                  apiKeyRequired:     evt.endpoint.apiKeyRequired,
                  requestModels:      evt.endpoint.requestModels,
                  requestParameters:  requestParameters
                };

                return _this.ApiGateway.putMethodPromised(params);
              });
        }, function(error) {

          // Method does not exist.  Create it.

          let params = {
            authorizationType:  evt.endpoint.authorizationType, /* required */
            httpMethod:         evt.endpoint.method, /* required */
            resourceId:         _this.resource.id, /* required */
            restApiId:          evt.region.restApiId, /* required */
            apiKeyRequired:     evt.endpoint.apiKeyRequired,
            requestModels:      evt.endpoint.requestModels,
            requestParameters:  requestParameters
          };

          return _this.ApiGateway.putMethodPromised(params);
        })
        .then(function(response) {

          SUtils.sDebug(
              '"'
              + evt.stage + ' - '
              + evt.region.region
              + ' - ' + evt.endpoint.path + '": '
              + 'created method: '
              + evt.endpoint.method);

          return evt;
        });
  }

  /**
   * Create Endpoint Integration
   */

  _createEndpointIntegration(evt) {

    let _this           = this;

    // Alias Lambda, default ot $LATEST
    let alias;
    if (evt.aliasEndpoint) alias  = evt.aliasEndpoint;
    else alias = '${stageVariables.functionAlias}';

    let params = {
      httpMethod:             evt.endpoint.method, /* required */
      resourceId:             _this.resource.id, /* required */
      restApiId:              evt.region.restApiId, /* required */
      type:                   'AWS', /* required */
      cacheKeyParameters:     evt.endpoint.cacheKeyParameters || [],
      cacheNamespace:         evt.endpoint.cacheNamespace     || null,
      // Due to a bug in API Gateway reported here: https://github.com/awslabs/aws-apigateway-swagger-importer/issues/41
      // Specifying credentials within API Gateway causes extra latency (~500ms)
      // Until API Gateway is fixed, we need to make a separate call to Lambda to add credentials to API Gateway
      // Once API Gateway is fixed, we can use this in credentials:
      // _this._regionJson.iamRoleArnApiGateway
      credentials:            null,
      integrationHttpMethod:  'POST',
      requestParameters:      evt.endpoint.requestParameters || {},
      requestTemplates:       evt.endpoint.requestTemplates  || {},
      uri:                    'arn:aws:apigateway:' // Make ARN for apigateway - lambda
                              + evt.region.region
                              + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
                              + evt.region.region
                              + ':'
                              + _this.awsAccountNumber
                              + ':function:'
                              + _this.deployedLambda.FunctionName
                              + ':'
                              + alias
                              + '/invocations'
    };

    // Create Integration
    return _this.ApiGateway.putIntegrationPromised(params)
        .then(function(response) {

          // Save integration
          _this.integration = response;

          SUtils.sDebug(
              '"'
              + evt.stage + ' - '
              + evt.region.region
              + ' - ' + evt.endpoint.path + '": '
              + 'created integration with the type: AWS');

          return evt;
        })
        .catch(function(error) {
          throw new SError(
              error.message,
              SError.errorCodes.UNKNOWN);
        });
  }

  /**
   * Create Endpoint Method Response
   */

  _createEndpointMethodResponses(evt) {

    let _this           = this;

    return BbPromise.try(function() {

          // Collect Response Keys
          if (evt.endpoint.responses) return Object.keys(evt.endpoint.responses);
          else return [];

        })
        .each(function(responseKey) {

          // Iterate through each response to be created

          let thisResponse       = evt.endpoint.responses[responseKey];
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
            httpMethod:         evt.endpoint.method, /* required */
            resourceId:         _this.resource.id, /* required */
            restApiId:          evt.region.restApiId, /* required */
            statusCode:         thisResponse.statusCode, /* required */
            responseModels:     responseModels,
            responseParameters: responseParameters
          };

          // Create Method Response
          return _this.ApiGateway.putMethodResponsePromised(params)
              .then(function() {

                SUtils.sDebug(
                    '"'
                    + evt.stage + ' - '
                    + evt.region.region
                    + ' - ' + evt.endpoint.path + '": '
                    + 'created method response');

              })
              .catch(function(error) {
                throw new SError(error.message);
              });
        })
        .then(function() {
          return evt;
        });
  }

  /**
   * Create Method Integration Response
   */

  _createEndpointMethodIntegResponses(evt) {

    let _this           = this;

    return BbPromise.try(function() {

          // Collect Response Keys
          if (evt.endpoint.responses) return Object.keys(evt.endpoint.responses);
          else return [];
        })
        .each(function(responseKey) {

          let thisResponse       = evt.endpoint.responses[responseKey];

          // Add Response Parameters
          let responseParameters = thisResponse.responseParameters || {};

          // Add Response Templates
          let responseTemplates  = thisResponse.responseTemplates || {};

          // Add SelectionPattern
          let selectionPattern   = thisResponse.selectionPattern || (responseKey === 'default' ? null : responseKey);

          let params = {
            httpMethod:         evt.endpoint.method, /* required */
            resourceId:         _this.resource.id, /* required */
            restApiId:          evt.region.restApiId, /* required */
            statusCode:         thisResponse.statusCode, /* required */
            responseParameters: responseParameters,
            responseTemplates:  responseTemplates,
            selectionPattern:   selectionPattern,
          };

          // Create Integration Response
          return _this.ApiGateway.putIntegrationResponsePromised(params)
              .then(function() {

                SUtils.sDebug(
                    '"'
                    + evt.stage + ' - '
                    + evt.region.region
                    + ' - ' + evt.endpoint.path + '": '
                    + 'created method integration response');

              }).catch(function(error) {
                throw new SError(error.message);
              });
        })
        .then(function() {
          return evt;
        });
  }

  /**
   * Manage Lambda Access Policy
   */

  _manageLambdaAccessPolicy(evt) {

    let _this = this;

    // If method integration is not for a lambda, skip
    if (!_this.deployedLambda) return Promise.resolve();

    return _this._getLambdaAccessPolicy(evt)
        .bind(_this)
        .then(_this._removeLambdaPermissionForEndpoint)
        .then(_this._addLambdaPermissionForEndpoint);
  }

  /**
   * Get Lambda Access Policy
   * - Since specifying credentials when creating the Method Integration results in ~500ms
   * - of extra latency, this function updates the lambda's access policy instead
   * - to grant API Gateway permission.  This is how the API Gateway console does it.
   * - But this is not finished and the "getPolicy" method in the SDK is broken, so this
   * - is currently impossible to implement.
   */

  _getLambdaAccessPolicy(evt) {

    let _this  = this;

    let params = {
      FunctionName: _this.deployedLambda.FunctionArn, /* required */
      //Qualifier: 'STRING_VALUE'
    };

    return _this.Lambda.getPolicyPromised(params)
        .then(function(data) {
          _this.deployedLambda.policy = JSON.parse(data.Policy);
          return evt;
        })
        .catch(function(e) {
          return evt;
        });
  }

  /**
   * Remove Lambda Access Policy
   */

  _removeLambdaPermissionForEndpoint(evt) {

    let _this       = this,
        statement;

    if (_this.deployedLambda.policy) {
      let policy = _this.deployedLambda.policy;
      for (let i = 0; i < policy.Statement.length; i++) {
        statement = policy.Statement[i];
        if (statement.Sid && statement.Sid === evt.endpoint.lambdaPolicyStatementId) continue;
      }
    }

    if (!statement) return BbPromise.resolve(evt);

    let params = {
      FunctionName: _this.deployedLambda.FunctionArn, /* required */
      StatementId:  evt.endpoint.lambdaPolicyStatementId, /* required */
      //Qualifier: 'STRING_VALUE'
    };

    return _this.Lambda.removePermissionPromised(params)
        .then(function(data) {

          SUtils.sDebug(
              '"'
              + evt.stage + ' - '
              + evt.region.region
              + ' - ' + evt.endpoint.path + '": '
              + 'removed existing lambda access policy statement');

          return evt;
        })
        .catch(function(error) {
          return evt;
        });
  }

  /**
   * Add Lambda Permission For Endpoint
   */

  _addLambdaPermissionForEndpoint(evt) {

    let _this       = this;

    // Sanitize Path - Remove first and last slashes, if any
    evt.endpoint.path = evt.endpoint.path.split('/');
    evt.endpoint.path = evt.endpoint.path.join('/');

    // Create new access policy statement
    let params          = {};
    params.Action       = 'lambda:InvokeFunction';
    params.FunctionName = _this.deployedLambda.FunctionArn;
    params.Principal    = 'apigateway.amazonaws.com';
    params.StatementId  = evt.endpoint.lambdaPolicyStatementId;
    params.SourceArn    = 'arn:aws:execute-api:'
        + evt.region.region
        + ':'
        + _this.awsAccountNumber
        + ':'
        + evt.region.restApiId
        + '/*/'
        + evt.endpoint.method
        + '/'
        + evt.endpoint.path;

    return _this.Lambda.addPermissionPromised(params)
        .then(function(data) {

          SUtils.sDebug(
              '"'
              + evt.stage + ' - '
              + evt.region.region
              + ' - ' + evt.endpoint.path + '": '
              + 'added permission to Lambda');

          return evt;

        })
        .catch(function(error) {
          throw new SError(error.message);
        });
  }

}

module.exports = EndpointBuildApiGateway;