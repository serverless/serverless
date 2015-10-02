'use strict';

/**
 * JAWS Command: deploy endpoint <stage> <region>
 * - Deploys project's API Gateway REST API to the specified stage and one or all regions
 */

// TODO: On completion, list API G routes not used within the project (all regions).  Offer option to delete them.

var JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    async = require('async'),
    path = require('path'),
    utils = require('../utils/index'),
    AWSUtils = require('../utils/aws'),
    CMDtag = require('./tag'),
    JawsAPIClient = require('jaws-api-gateway-client');

Promise.promisifyAll(fs);

/**
 * Run
 * @param JAWS
 * @param stage
 * @param region
 * @param allTagged
 * @returns {*}
 */

module.exports.run = function(JAWS, stage, region, allTagged) {
  var command = new CMD(JAWS, stage, region, allTagged);
  return command.run();
};

/**
 * CMD Class
 * @param JAWS
 * @param stage
 * @param region
 * @param allTagged
 * @constructor
 */

function CMD(JAWS, stage, region, allTagged) {
  var _this = this;
  _this._stage = stage;
  _this._allTagged = allTagged;
  _this._JAWS = JAWS;
  _this._prjJson = JAWS._meta.projectJson;
  _this._prjRootPath = JAWS._meta.projectRootPath;
  _this._prjCreds = JAWS._meta.credentials;

  if (region && stage) {
    _this._regions = _this._JAWS._meta.projectJson.stages[_this._stage].filter(function(r) {
      return (r.region == region);
    });
  } else if (stage) {
    _this._regions = _this._JAWS._meta.projectJson.stages[_this._stage];
  }
}

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  // Flow
  return _this._JAWS.validateProject()
      .bind(_this)
      .then(function() {
        // If !allTagged, tag current directory
        if (!_this._allTagged) {
          return CMDtag.tag('endpoint', null, false);
        }
      })
      .then(_this._promptStage)
      .then(_this._promptRegions)
      .then(function() {
        return _this._regions;
      })
      .each(function(regionJson) {

        JawsCli.log('Endpoint Deployer:  Deploying endpoint(s) to region "' + regionJson.region + '"...');

        var deployer = new ApiDeployer(
            _this._JAWS,
            _this._stage,
            regionJson,
            _this._prjRootPath,
            _this._prjJson,
            _this._prjCreds
        );

        return deployer.deploy()
            .then(function(url) {
              JawsCli.log('Endpoint Deployer:  Endpoints for stage "'
                  + _this._stage
                  + '" successfully deployed to API Gateway in the region "'
                  + regionJson.region
                  + '". Access them @ '
                  + url);
            });
      })
      .then(function() {
        // Untag All tagged endpoints
        return _this._allTagged ? CMDtag.tagAll(_this._JAWS, 'endpoint', true) : CMDtag.tag('endpoint', null, true);
      });
});

/**
 * CMD: Prompt Stage
 */

CMD.prototype._promptStage = Promise.method(function() {

  var _this = this;

  // If stage, skip
  if (_this._stage) return;

  var stages = Object.keys(_this._prjJson.stages);
  if (!stages.length) {
    throw new JawsError('You have no stages in this project');
  }

  // If project has only one stage, skip select
  if (stages.length === 1) {
    _this._stage = stages[0];
    return;
  }

  var choices = [];
  for (var i = 0; i < stages.length; i++) {
    choices.push({
      key: '',
      value: stages[i],
      label: stages[i]
    });
  }

  return JawsCli.select('Select a stage to deploy to: ', choices, false);
});

/**
 * CMD: Prompt Regions
 */

CMD.prototype._promptRegions = Promise.method(function() {

  var _this = this;

  // If regions, skip
  if (_this._regions && _this._regions.length) return;

  var regions =  _this._JAWS._meta.projectJson.stages[_this._stage];

  // If stage has only one region, skip select
  if (regions.length === 1) {
    _this._regions = regions;
    return;
  }

  var choices = [];
  for (var i = 0; i < regions.length; i++) {
    choices.push({
      key: '',
      value: regions[i].region,
      label: regions[i].region,
    });
  }

  return JawsCli.select('Select a region in this stage to deploy to: ', choices, false);
});

/**
 * Api Deployer
 * @param JAWS
 * @param stage
 * @param region
 * @param prjRootPath
 * @param prjJson
 * @param prjCreds
 * @constructor
 */

function ApiDeployer(JAWS, stage, region, prjRootPath, prjJson, prjCreds) {

  var _this = this;
  _this._JAWS = JAWS;
  _this._stage = stage;
  _this._regionJson = region;
  _this._prjJson = prjJson;
  _this._prjRootPath = prjRootPath;
  _this._prjCreds = prjCreds;
  _this._endpoints = [];
  _this._resources = [];

  _this._awsAccountNumber = _this._regionJson.iamRoleArnApiGateway.replace('arn:aws:iam::', '').split(':')[0];
  _this._restApiId = _this._regionJson.restApiId ? _this._regionJson.restApiId : null;

  // Instantiate API Gateway Client
  this.ApiClient = new JawsAPIClient({
    accessKeyId: prjCreds.aws_access_key_id,
    secretAccessKey: prjCreds.aws_secret_access_key,
    region: region.region,
  });
}

/**
 * API Deployer: Deploy
 */

ApiDeployer.prototype.deploy = Promise.method(function() {

  var _this = this;

  return _this._findTaggedEndpoints()
      .bind(_this)
      .then(_this._validateAndSantizeTaggedEndpoints)
      .then(_this._fetchDeployedLambdas)
      .then(_this._findOrCreateApi)
      .then(_this._saveApiId)
      .then(_this._listApiResources)
      .then(_this._buildEndpoints)
      .then(_this._createDeployment)
      .then(function() {
        return 'https://'
            + _this._restApiId
            + '.execute-api.'
            + _this._regionJson.region
            + '.amazonaws.com/'
            + _this._stage
            + '/';
      });
});

/**
 * ApiDeployer: Find Tagged Endpoints
 */

ApiDeployer.prototype._findTaggedEndpoints = Promise.method(function() {

  var _this = this;

  return utils.findAllEndpoints(_this._prjRootPath)
      .each(function(endpoint) {

        var eJson = require(endpoint);
        if (eJson.apiGateway.deploy) _this._endpoints.push(eJson);

      }).then(function() {

        if (!_this._endpoints.length) {
          throw new JawsError(
              'You have no tagged endpoints',
              JawsError.errorCodes.UNKNOWN);
        }

        JawsCli.log(
            'Endpoint Deployer:  "'
            + _this._stage + ' - '
            + _this._regionJson.region
            + '": found '
            + _this._endpoints.length + ' endpoints to deploy');
      });
});

/**
 * ApiDeployer: Fetch Deployed Lambdas In CF Stack
 */

ApiDeployer.prototype._fetchDeployedLambdas = Promise.method(function() {

  var _this = this;
  _this._lambdas = [];
  var moreResources = true;
  var nextStackToken;

  async.whilst(
      function() {
        return moreResources === true;
      },

      function(callback) {
        AWSUtils.cfListStackResources(
            _this._JAWS._meta.profile,
            _this._regionJson.region,
            _this._stage + '-' + _this._JAWS._meta.projectJson.name + '-l',
            nextStackToken
        )
            .then(function(lambdaCfResources) {

              // Add deployed lambdas
              if (lambdaCfResources.StackResourceSummaries) {
                _this._lambdas = _this._lambdas.concat(lambdaCfResources.StackResourceSummaries);
              }

              // Check if more resources are available
              if (!lambdaCfResources.NextToken) {
                moreResources = false;
              }

              return callback();
            })
            .catch(function(error) {
              JawsCli.log('Warning: JAWS could not find a deployed Cloudformation '
                  + 'template containing lambda functions.');
              console.log(error);
              moreResources = false;
              return callback();
            });
      },

      function() {
        return;
      }
  );
});

/**
 * API Deployer: Validate & Sanitize Tagged Endpoints
 */

ApiDeployer.prototype._validateAndSantizeTaggedEndpoints = Promise.method(function() {

  var _this = this;

  // Loop through tagged endpoints
  for (var i = 0; i < _this._endpoints.length; i++) {

    var e = _this._endpoints[i].apiGateway.cloudFormation;

    // Validate attributes
    if (!e.Type
        || !e.Path
        || !e.Method
        || !e.AuthorizationType
        || typeof e.ApiKeyRequired === 'undefined') {
      throw new JawsError(
          'Missing one of many required endpoint attributes: type, path, method, authorizationType, apiKeyRequired',
          JawsError.errorCodes.UNKNOWN);
    }

    // Sanitize path
    if (e.Path.charAt(0) === '/') e.Path = e.Path.substring(1);

    // Sanitize method
    e.Method = e.Method.toUpperCase();
  }
});

/**
 * API Deployer: Save API ID
 */

ApiDeployer.prototype._saveApiId = Promise.method(function() {

  var _this = this;

  // Attach API Gateway REST API ID
  for (var i = 0; i < _this._prjJson.stages[_this._stage].length; i++) {
    if (_this._prjJson.stages[_this._stage][i].region === _this._regionJson.region) {
      _this._prjJson.stages[_this._stage][i].restApiId = _this._restApiId;
    }
  }

  fs.writeFileSync(path.join(_this._prjRootPath, 'jaws.json'), JSON.stringify(_this._prjJson, null, 2));
});

/**
 * API Deployer: Find Or Create API
 */

ApiDeployer.prototype._findOrCreateApi = Promise.method(function() {

  var _this = this;

  // Check Project's jaws.json for restApiId, otherwise create an api
  if (_this._restApiId) {

    // Show existing REST API
    return _this.ApiClient.showRestApi(_this._restApiId)
        .then(function(response) {

          _this._restApiId = response.id;
          JawsCli.log(
              'Endpoint Deployer:  "'
              + _this._stage + ' - '
              + _this._regionJson.region
              + '": found existing REST API on AWS API Gateway with ID: '
              + response.id);
        });
  } else {

    // Create REST API

    var apiName = _this._prjJson.name + '-' + _this._stage;
    apiName = apiName.substr( 0, 1023 ); // keep the name length below the limits

    return _this.ApiClient.createRestApi({
      name: apiName,
      description: _this._prjJson.description ? _this._prjJson.description : 'A REST API for a JAWS project.',
    }).then(function(response) {

      _this._restApiId = response.id;
      JawsCli.log(
          'Endpoint Deployer:  "'
          + _this._stage + ' - '
          + _this._regionJson.region
          + '": created a new REST API on AWS API Gateway with ID: '
          + response.id);
    });
  }
});

/**
 * API Deployer: List API Resources
 */

ApiDeployer.prototype._listApiResources = Promise.method(function() {

  var _this = this;

  // List all Resources for this REST API
  return _this.ApiClient.listResources(_this._restApiId)
      .then(function(response) {

        // Parse API Gateway's HAL response
        _this._resources = response._embedded.item;
        if (!Array.isArray(_this._resources)) _this._resources = [_this._resources];

        // Get Parent Resource ID
        for (var i = 0; i < _this._resources.length; i++) {
          if (_this._resources[i].path === '/') {
            _this._parentResourceId = _this._resources[i].id;
          }
        }

        JawsCli.log(
            'Endpoint Deployer:  "'
            + _this._stage + ' - '
            + _this._regionJson.region
            + '": found '
            + _this._resources.length
            + ' existing resources on API Gateway');
      });
});

/**
 * API Deployer: Build Endpoints
 */

ApiDeployer.prototype._buildEndpoints = Promise.method(function() {

  var _this = this;

  return Promise.try(function() {
    return _this._endpoints;
  }).each(function(endpoint) {

    return _this._createEndpointResources(endpoint)
        .bind(_this)
        .then(_this._createEndpointMethod)
        .then(_this._createEndpointIntegration)
        .then(_this._manageLambdaAccessPolicy)
        .then(_this._createEndpointMethodResponses)
        .then(_this._createEndpointMethodIntegResponses)
        .then(function() {

          // Clean-up hack
          // TODO figure out how "apig" temp property is being written to the awsm's json and remove that
          if (endpoint.apiGateway.apig) delete endpoint.apiGateway.apig;
        });
  });
});

/**
 * API Deployer: Create Endpoint Resources
 */

ApiDeployer.prototype._createEndpointResources = Promise.method(function(endpoint) {

  var _this = this;
  var eResources = endpoint.apiGateway.cloudFormation.Path.split('/');

  /**
   * Private Function to find resource
   * @param resource
   * @param parent
   * @returns {*}
   */

  var findEndpointResource = function(resource, parent) {

    // Replace slashes in resource
    resource = resource.replace(/\//g, '');
    var index = eResources.indexOf(resource);

    if (parent)  {
      index = index - 1;
      resource = eResources[index];
    }

    if (index < 0) {
      resourcePath = '/';
    } else {
      var resourceIndex = endpoint.apiGateway.cloudFormation.Path.indexOf(resource);
      var resourcePath = '/' + endpoint.apiGateway.cloudFormation.Path.substring(0, resourceIndex + resource.length);
    }

    // If resource has already been created, skip it
    for (var i = 0; i < _this._resources.length; i++) {

      // Check if path matches, in case there are duplicate resources (users/list, org/list)
      if (_this._resources[i].path === resourcePath) {
        return _this._resources[i];
      }
    }
  };

  // Create temp property for saving state information
  endpoint.apiGateway.apig = {};

  return Promise.try(function() {

    return eResources;

  }).each(function(eResource) {

    // Remove slashes in resource
    eResource = eResource.replace(/\//g, '');

    // If resource exists, skip it
    var resource = findEndpointResource(eResource);
    if (resource) return resource;

    // Get Parent Resource
    endpoint.apiGateway.apig.parentResourceId = findEndpointResource(eResource, true).id;

    // Create Resource
    return _this.ApiClient.createResource(
        _this._restApiId,
        endpoint.apiGateway.apig.parentResourceId,
        eResource)
        .then(function(response) {

          // Add resource to _this.resources and callback
          _this._resources.push(response);
          JawsCli.log(
              'Endpoint Deployer:  "' +
              _this._stage + ' - '
              + _this._regionJson.region
              + ' - ' + endpoint.apiGateway.cloudFormation.Path + '": '
              + 'created resource: '
              + response.pathPart);
        });

  }).then(function() {

    // Attach the last resource to endpoint for later use
    var endpointResource = endpoint.apiGateway.cloudFormation.Path.split('/').pop().replace(/\//g, '');
    endpoint.apiGateway.apig.resource = findEndpointResource(endpointResource);
    return endpoint;
  });
});

/**
 * API Deployer: Create Endpoint Method
 */

ApiDeployer.prototype._createEndpointMethod = Promise.method(function(endpoint) {

  var _this = this;

  // Create Method
  var methodBody = {
    authorizationType: endpoint.apiGateway.cloudFormation.AuthorizationType,
  };

  // If Request Params, add them
  if (endpoint.apiGateway.cloudFormation.RequestParameters) {

    methodBody.requestParameters = {};

    // Format them per APIG API's Expectations
    for (var prop in endpoint.apiGateway.cloudFormation.RequestParameters) {
      var requestParam = endpoint.apiGateway.cloudFormation.RequestParameters[prop];
      methodBody.requestParameters[requestParam] = true;
    }
  }

  return _this.ApiClient.showMethod(
      _this._restApiId,
      endpoint.apiGateway.apig.resource.id,
      endpoint.apiGateway.cloudFormation.Method)
      .then(function() {

        return _this.ApiClient.deleteMethod(
            _this._restApiId,
            endpoint.apiGateway.apig.resource.id,
            endpoint.apiGateway.cloudFormation.Method)
            .then(function() {
              _this.ApiClient.putMethod(
                  _this._restApiId,
                  endpoint.apiGateway.apig.resource.id,
                  endpoint.apiGateway.cloudFormation.Method,
                  methodBody);
            });
      }, function() {

        return _this.ApiClient.putMethod(
            _this._restApiId,
            endpoint.apiGateway.apig.resource.id,
            endpoint.apiGateway.cloudFormation.Method,
            methodBody);
      })
      .delay(250) // API Gateway takes time to delete Methods.  Might have to increase this.
      .then(function(response) {

        JawsCli.log(
            'Endpoint Deployer:  "'
            + _this._stage + ' - '
            + _this._regionJson.region
            + ' - ' + endpoint.apiGateway.cloudFormation.Path + '": '
            + 'created method: '
            + endpoint.apiGateway.cloudFormation.Method);
        return endpoint;
      });
});

/**
 * API Deployer: Create Endpoint Integration
 */

ApiDeployer.prototype._createEndpointIntegration = Promise.method(function(endpoint) {

  var _this = this;

  // Create Integration
  if (endpoint.type === 'lambda' || typeof endpoint.lambda !== 'undefined') {

    // Find Deployed Lambda and its function name
    var cfLogicalResourceId = utils.generateLambdaName(endpoint);
    var lambda = null;

    for (var i = 0; i < _this._lambdas.length; i++) {
      if (_this._lambdas[i].LogicalResourceId === cfLogicalResourceId) {
        lambda = _this._lambdas[i];
      }
    }

    // If no deployed lambda found, throw error
    if (!lambda) {
      throw new JawsError('Could not find a lambda deployed in this stage/region with this function name: '
          + cfLogicalResourceId);
    }
    endpoint.apiGateway.apig.lambda = lambda;

    // Create integration body
    var integrationBody = {
      type: 'AWS',
      httpMethod: 'POST', // Must be post for lambda
      authorizationType: 'none',
      uri: 'arn:aws:apigateway:' // Make ARN for apigateway - lambda
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
      credentials: null,
      requestParameters: endpoint.apiGateway.cloudFormation.RequestParameters || {},
      requestTemplates: endpoint.apiGateway.cloudFormation.RequestTemplates || {},
      cacheNamespace: endpoint.apiGateway.cloudFormation.CacheNamespace || null,
      cacheKeyParameters: endpoint.apiGateway.cloudFormation.CacheKeyParameters || [],
    };

  } else {
    throw new JawsError('JAWS API Gateway integration currently works with Lambdas only.');
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
});

/**
 * API Deployer: Create Endpoint Method Responses
 */

ApiDeployer.prototype._createEndpointMethodResponses = Promise.method(function(endpoint) {

  var _this = this;

  return Promise.try(function() {

    // Collect Response Keys
    if (endpoint.apiGateway.cloudFormation.Responses) return Object.keys(endpoint.apiGateway.cloudFormation.Responses);
    else return [];
  })
      .each(function(responseKey) {

        var thisResponse = endpoint.apiGateway.cloudFormation.Responses[responseKey];
        var methodResponseBody = {};

        // If Request Params, add them
        if (thisResponse.responseParameters) {

          methodResponseBody.responseParameters = {};

          // Format Response Parameters per APIG API's Expectations
          for (var prop in thisResponse.responseParameters) {
            methodResponseBody.responseParameters[prop] = true;
          }
        }

        // Create Method Response
        return _this.ApiClient.putMethodResponse(
            _this._restApiId,
            endpoint.apiGateway.apig.resource.id,
            endpoint.apiGateway.cloudFormation.Method,
            thisResponse.statusCode,
            methodResponseBody)
            .then(function() {
              JawsCli.log(
                  'Endpoint Deployer:  "'
                  + _this._stage
                  + ' - '
                  + _this._regionJson.region
                  + ' - '
                  + endpoint.apiGateway.cloudFormation.Path
                  + '": '
                  + 'created method response');
            })
            .catch(function(error) {
              throw new JawsError(
                  error.message,
                  JawsError.errorCodes.UNKNOWN);
            });
      })
      .then(function() {
        return endpoint;
      });
});

/**
 * API Deployer: Create Endpoint Method Integration Responses
 */

ApiDeployer.prototype._createEndpointMethodIntegResponses = Promise.method(function(endpoint) {

  var _this = this;

  return Promise.try(function() {

    // Collect Response Keys
    if (endpoint.apiGateway.cloudFormation.Responses) return Object.keys(endpoint.apiGateway.cloudFormation.Responses);
    else return [];
  })
      .each(function(responseKey) {

        var thisResponse = endpoint.apiGateway.cloudFormation.Responses[responseKey];
        var integrationResponseBody = {};

        // Add Response Parameters
        integrationResponseBody.responseParameters = thisResponse.responseParameters || {};

        // Add Response Templates
        integrationResponseBody.responseTemplates = thisResponse.responseTemplates || {};

        // Add SelectionPattern
        integrationResponseBody.selectionPattern = thisResponse.selectionPattern || (responseKey === 'default' ? null : responseKey);

        // Create Integration Response
        return _this.ApiClient.putIntegrationResponse(
            _this._restApiId,
            endpoint.apiGateway.apig.resource.id,
            endpoint.apiGateway.cloudFormation.Method,
            thisResponse.statusCode,
            integrationResponseBody)
            .then(function() {
              JawsCli.log(
                  'Endpoint Deployer:  "'
                  + _this._stage
                  + ' - '
                  + _this._regionJson.region
                  + ' - '
                  + endpoint.apiGateway.cloudFormation.Path
                  + '": '
                  + 'created method integration response');
            }).catch(function(error) {
              throw new JawsError(
                  error.message,
                  JawsError.errorCodes.UNKNOWN);
            });
      });
});

ApiDeployer.prototype._manageLambdaAccessPolicy = Promise.method(function(endpoint) {

  var _this = this;

  // If method integration is not for a lambda, skip
  if (!endpoint.apiGateway.apig.lambda) return endpoint;

  return _this._getLambdaAccessPolicy(endpoint)
      .bind(_this)
      .then(_this._removeLambdaAccessPolicy)
      .then(_this._updateLambdaAccessPolicy);
});

/**
 * API Deployer: Get Lambda Access Policy
 * - Since specifying credentials when creating the Method Integration results in ~500ms
 * - of extra latency, this function updates the lambda's access policy instead
 * - to grant API Gateway permission.  This is how the API Gateway console does it.
 * - But this is not finished and the "getPolicy" method in the SDK is broken, so this
 * - is currently impossible to implement.
 */

ApiDeployer.prototype._getLambdaAccessPolicy = Promise.method(function(endpoint) {

  var _this = this;

  return AWSUtils.lambdaGetPolicy(
      _this._JAWS._meta.profile,
      _this._regionJson.region,
      endpoint.apiGateway.apig.lambda.PhysicalResourceId)
      .then(function(data) {
        endpoint.apiGateway.apig.lambda.Policy = JSON.parse(data.Policy);
        return endpoint;
      })
      .catch(function(error) {
        return endpoint;
      });
});

/**
 * Remove Lambda Access Policy
 */

ApiDeployer.prototype._removeLambdaAccessPolicy = Promise.method(function(endpoint) {

  var _this = this;
  var statement;

  if (endpoint.apiGateway.apig.lambda.Policy) {

    var policy = endpoint.apiGateway.apig.lambda.Policy;

    for (var i = 0; i < policy.Statement.length; i++) {
      statement = policy.Statement[i];
      if (statement.Sid && statement.Sid === 'jaws-apigateway-access') continue;
    }
  }

  if (!statement) return endpoint;

  return AWSUtils.lambdaRemovePermission(
      _this._JAWS._meta.profile,
      _this._regionJson.region,
      endpoint.apiGateway.apig.lambda.PhysicalResourceId,
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
});

/**
 * Update Lambda Access Policy
 */

ApiDeployer.prototype._updateLambdaAccessPolicy = Promise.method(function(endpoint) {

  var _this = this;

  // Sanitize Path - Remove first and last slashes, if any
  endpoint.apiGateway.cloudFormation.Path = endpoint.apiGateway.cloudFormation.Path.split('/');
  endpoint.apiGateway.cloudFormation.Path = endpoint.apiGateway.cloudFormation.Path.join('/');

  // Create new access policy statement
  var statement = {};
  statement.Action = 'lambda:InvokeFunction';
  statement.FunctionName = endpoint.apiGateway.apig.lambda.PhysicalResourceId;
  statement.Principal = 'apigateway.amazonaws.com';
  statement.StatementId = 'jaws-apigateway-access';
  statement.SourceArn = 'arn:aws:execute-api:'
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
      _this._JAWS._meta.profile,
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
});

/**
 * API Deployer: Create Deployment
 */

ApiDeployer.prototype._createDeployment = Promise.method(function() {

  var _this = this;

  var deployment = {
    stageName: _this._stage,
    stageDescription: _this._stage,
    description: 'JAWS deployment',
  };

  return _this.ApiClient.createDeployment(_this._restApiId, deployment)
      .then(function(response) {
        return response;
      })
      .catch(function(error) {
        throw new JawsError(
            error.message,
            JawsError.errorCodes.UNKNOWN);
      });
});
