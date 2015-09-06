'use strict';

/**
 * JAWS Command: deploy api <stage> <region>
 * - Deploys project's API Gateway REST API to the specified stage and region(s)
 */

// TODO: figure out what specific permissions are needed
// TODO: Make verbose support better/more informative
// TODO: Add Concurrent API creation across multiple regions, currently consecutive
// TODO: Make "routes" command
// TODO: Add restApiId's to regions in jaws.json "project" after creation

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    utils = require('../utils/index'),
    JawsAPIClient = require('jaws-api-gateway-client');

Promise.promisifyAll(fs);

/**
 * Api Deployer Class
 * @param stage
 * @param regions
 * @param prjJson
 * @param prjRootPath
 * @param prjCreds
 * @constructor
 */

function ApiDeployer(stage, region, prjRootPath, prjJson, prjCreds) {

  var _this = this;
  _this._stage = stage;
  _this._region = region;
  _this._prjJson = prjJson;
  _this._prjRootPath = prjRootPath;
  _this._prjCreds = prjCreds;
  _this._endpoints = [];
  _this._resources = [];
  _this._awsAccountNumber = _this._region.iamRoleArn.replace('arn:aws:iam::', '').split(':')[0];
  _this._restApiId = _this._region.restApiId ? _this._region.restApiId : null;

  // Instantiate API Gateway Client
  this.ApiClient = new JawsAPIClient({
    accessKeyId: prjCreds.aws_access_key_id,
    secretAccessKey: prjCreds.aws_secret_access_key,
    region: region.region,
  });
}

/**
 * Deploy
 */
ApiDeployer.prototype.deploy = Promise.method(function() {

  var _this = this;

  return _this._findTaggedEndpoints()
      .bind(_this)
      .then(_this._validateTaggedEndpoints)
      .then(_this._findOrCreateApi)
      .then(_this._listApiResources)
      .then(_this._buildEndpoints)
      .then(_this._createDeployment)
      .then(function() {
        return 'https://'
            + _this._restApiId
            + '.execute-api.'
            + _this._region.region
            + '.amazonaws.com/'
            + _this._stage
            + '/';
      });
});

/**
 * Find Tagged Endpoints
 */
ApiDeployer.prototype._findTaggedEndpoints = Promise.method(function() {

  var _this = this;

  return utils.findAllEndpoints(_this._prjRootPath)
      .each(function(endpoint) {

        var eJson = require(endpoint);
        if (eJson.endpoint.deploy) _this._endpoints.push(eJson);

      }).then(function() {

        if (!_this._endpoints.length) {
          throw new JawsError(
              'You have no tagged endpoints',
              JawsError.errorCodes.UNKNOWN);
        }

        utils.logIfVerbose(
            'API Gateway: "'
            + _this._stage + ' - '
            + _this._region.region
            + '": found '
            + _this._endpoints.length + ' endpoints to deploy');
      });
});

/**
 * Validate & Sanitize Tagged Endpoints
 */
ApiDeployer.prototype._validateAndSantizeTaggedEndpoints = Promise.method(function() {

  var _this = this;

  // Loop through tagged endpoints
  for (var i = 0;i < _this._endpoints.length;i++) {

    var e = _this._endpoints[i];

    // Validate attributes
    if (!e.type
        || !e.path
        || !e.method
        || !e.authorizationType
        || !e.apiKeyRequired) {
      throw new JawsError(
          'Missing one of many required endpoint attributes: type, path, method, authorizationType, apiKeyRequired',
          JawsError.errorCodes.UNKNOWN);
    }

    // Sanitize path
    if (_this._endpoints[i].path.charAt(0) === '/') _this._endpoints[i].path = _this._endpoints[i].path.substring(1);

    // Sanitize method
    _this._endpoints[i].method = _this._endpoints[i].method.toUpperCase();

  }
});

/**
 * Find Or Create API
 */
ApiDeployer.prototype._findOrCreateApi = Promise.method(function() {

  var _this = this;

  // Check Project's jaws.json for restApiId, otherwise create an api
  if (_this._restApiId) {

    // Show existing REST API
    return _this.ApiClient.showRestApi(_this._restApiId)
        .then(function(response) {

          _this._restApiId = response.id;
          utils.logIfVerbose(
              'API Gateway: "'
              + _this._stage + ' - '
              + _this._region.region
              + '": found existing REST API on AWS API Gateway with ID: '
              + response.id);
        });
  } else {

    // Create REST API
    return _this.ApiClient.createRestApi({
      name: _this._prjJson.name,
      description: _this._prjJson.description ? _this._prjJson.description : 'A REST API for a JAWS project.',
    }).then(function(response) {

      _this._restApiId = response.id;
      utils.logIfVerbose(
          'API Gateway: "'
          + _this._stage + ' - '
          + _this._region.region
          + '": created a new REST API on AWS API Gateway with ID: '
          + response.id);
    });
  }
});

/**
 * List API Resources
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

        utils.logIfVerbose(
            'API Gateway: "'
            + _this._stage + ' - '
            + _this._region.region
            + '": found '
            + _this._resources.length
            + ' existing resources on API Gateway');
      });
});

/**
 * Build Endpoints
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
        .then(_this._createEndpointMethodResponses)
        .then(_this._createEndpointMethodIntegResponses);
  });
});

/**
 * Create Endpoint Resources
 */
ApiDeployer.prototype._createEndpointResources = Promise.method(function(endpoint) {

  var _this = this;
  var eResources;

  return Promise.try(function() {

    eResources = endpoint.endpoint.path.split('/');
    endpoint.endpoint.apig = {};
    return eResources;

  }).each(function(eResource) {

    eResource = eResource.replace(/\//g, '');

    // If already created, skip
    for (var i = 0; i < _this._resources.length; i++) {
      if (_this._resources[i].pathPart && _this._resources[i].pathPart === eResource) {
        return _this._resources[i];
      }
    }

    // Get this resource's parent ID
    var parentIndex = eResources.indexOf(eResource) - 1;
    if (parentIndex === -1) {
      endpoint.endpoint.apig.parentResourceId = _this._parentResourceId;
    } else if (parentIndex > -1) {

      // Get Parent Resource ID
      for (var i = 0; i < _this._resources.length; i++) {
        if (_this._resources[i].pathPart === eResources[parentIndex]) {
          endpoint.endpoint.apig.parentResourceId = _this._resources[i].id;
        }
      }
    }

    // Create Resource
    return _this.ApiClient.createResource(
        _this._restApiId,
        endpoint.endpoint.apig.parentResourceId,
        eResource)
        .then(function(response) {

          // Add resource to _this.resources and callback
          _this._resources.push(response);
          utils.logIfVerbose(
              'API Gateway: "' +
              _this._stage + ' - '
              + _this._region.region
              + ' - ' + endpoint.endpoint.path + '": '
              + 'created resource: '
              + response.pathPart);
        });

  }).then(function() {

    // Attach the last resource to endpoint for later use
    var endpointResource = endpoint.endpoint.path.split('/').pop().replace(/\//g, '');
    for (var i = 0; i < _this._resources.length; i++) {
      if (_this._resources[i].pathPart && _this._resources[i].pathPart === endpointResource) {
        endpoint.endpoint.apig.resource = _this._resources[i];
      }
    }

    return endpoint;
  });
});

/**
 * Create Endpoint Method
 */
ApiDeployer.prototype._createEndpointMethod = Promise.method(function(endpoint) {

  var _this = this;

  // Create Method
  var methodBody = {
    authorizationType: endpoint.endpoint.authorizationType,
  };

  // If Request Params, add them
  if (endpoint.endpoint.requestParameters) {

    methodBody.requestParameters = {};

    // Format them per APIG API's Expectations
    for (var prop in endpoint.endpoint.requestParameters) {
      var requestParam = endpoint.endpoint.requestParameters[prop];
      methodBody.requestParameters[requestParam] = true;
    }
  }

  return _this.ApiClient.showMethod(
      _this._restApiId,
      endpoint.endpoint.apig.resource.id,
      endpoint.endpoint.method)
      .then(function() {
        return _this.ApiClient.deleteMethod(
            _this._restApiId,
            endpoint.endpoint.apig.resource.id,
            endpoint.endpoint.method)
            .then(function() {
              _this.ApiClient.putMethod(
                  _this._restApiId,
                  endpoint.endpoint.apig.resource.id,
                  endpoint.endpoint.method,
                  methodBody);
            });
      }, function() {
        return _this.ApiClient.putMethod(
            _this._restApiId,
            endpoint.endpoint.apig.resource.id,
            endpoint.endpoint.method,
            methodBody);
      })
      .delay(250) // API Gateway takes time to delete Methods.  Might have to increase this.
      .then(function(response) {

        utils.logIfVerbose(
            'API Gateway: "'
            + _this._stage + ' - '
            + _this._region.region
            + ' - ' + endpoint.endpoint.path + '": '
            + 'created method: '
            + endpoint.endpoint.method);
        return endpoint;
      });
});

/**
 * Create Endpoint Integration
 */
ApiDeployer.prototype._createEndpointIntegration = Promise.method(function(endpoint) {

  var _this = this;

  // Create Integration
  if (endpoint.type === 'lambda' || typeof endpoint.lambda !== 'undefined') {

    var integrationBody = {
      type: 'AWS',
      httpMethod: 'POST', // Must be post for lambda
      authorizationType: 'none',
      uri: 'arn:aws:apigateway:'
            + _this._region.region
            + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
            + _this._region.region
            + ':'
            + _this._awsAccountNumber
            + ':function:'
            + [_this._stage,
        _this._prjJson.name,
        endpoint.lambda.functionName,
      ].join('_-_').replace(/ /g, '')
            + '/invocations',
      credentials: _this._region.iamRoleArn,
      requestParameters: endpoint.endpoint.requestParameters || {},
      requestTemplates: endpoint.endpoint.requestTemplates || {},
      cacheNamespace: endpoint.endpoint.cacheNamespace || null,
      cacheKeyParameters: endpoint.endpoint.cacheKeyParameters || [],
    };

  } else {
    throw new JawsError(
        'JAWS API Gateway integration currently supports type: "lambda" only',
        JawsError.errorCodes.UNKNOWN);
  }

  // Create Integration
  return _this.ApiClient.putIntegration(
      _this._restApiId,
      endpoint.endpoint.apig.resource.id,
      endpoint.endpoint.method,
      integrationBody)
      .then(function(response) {

        // Save integration to apig property
        endpoint.endpoint.apig.integration = response;
        utils.logIfVerbose(
            'API Gateway: "'
            + _this._stage + ' - '
            + _this._region.region
            + ' - ' + endpoint.endpoint.path + '": '
            + 'created integration with the type: '
            + endpoint.endpoint.type);
        return endpoint;
      })
      .catch(function(error) {
        throw new JawsError(
            error.message,
            JawsError.errorCodes.UNKNOWN);
      });
});

/**
 * Create Endpoint Method Responses
 */
ApiDeployer.prototype._createEndpointMethodResponses = Promise.method(function(endpoint) {

  var _this = this;

  return Promise.try(function() {

    // Collect Response Keys
    if (endpoint.endpoint.responses) return Object.keys(endpoint.endpoint.responses);
    else return [];
  })
      .each(function(responseKey) {

        var thisResponse = endpoint.endpoint.responses[responseKey];
        var methodResponseBody = {};

        // Format Response Parameters per APIG API's Expectations
        for (prop in thisResponse.responseParameters) {
          var param = endpoint.endpoint.responseParameters[prop];
          methodResponseBody.responseParameters[param[prop]] = true;
        }

        // Create Method Response
        return _this.ApiClient.putMethodResponse(
            _this._restApiId,
            endpoint.endpoint.apig.resource.id,
            endpoint.endpoint.method,
            thisResponse.statusCode,
            methodResponseBody)
            .then(function() {
              utils.logIfVerbose(
                  'API Gateway: "' +
                  _this._stage + ' - ' +
                  _this._region.region
                  + ' - ' + endpoint.endpoint.path + '": '
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
 * Create Endpoint Method Integration Responses
 */
ApiDeployer.prototype._createEndpointMethodIntegResponses = Promise.method(function(endpoint) {

  var _this = this;

  return Promise.try(function() {

    // Collect Response Keys
    if (endpoint.endpoint.responses) return Object.keys(endpoint.endpoint.responses);
    else return [];
  })
      .each(function(responseKey) {

        var thisResponse = endpoint.endpoint.responses[responseKey];
        var integrationResponseBody = {};

        // Add Response Parameters
        integrationResponseBody.responseParameters = thisResponse.responseParameters;

        // Add Response Templates
        integrationResponseBody.responseTemplates = thisResponse.responseTemplates;

        // Add SelectionPattern
        integrationResponseBody.selectionPattern = responseKey === 'default' ? null : responseKey;// null = default

        // Create Integration Response
        return _this.ApiClient.putIntegrationResponse(
            _this._restApiId,
            endpoint.endpoint.apig.resource.id,
            endpoint.endpoint.method,
            thisResponse.statusCode,
            integrationResponseBody)
            .then(function() {
              utils.logIfVerbose(
                  'API Gateway: "'
                  + _this._stage + ' - '
                  + _this._region.region
                  + ' - ' + endpoint.endpoint.path + '": '
                  + 'created method integration response');
            }).catch(function(error) {
              reject(new JawsError(
                  error.message,
                  JawsError.errorCodes.UNKNOWN));
            });
      });
});

/**
 * Create Deployment
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

/**
 * Create Endpoint Method Responses
 */
ApiDeployer.prototype._createEndpointMethodResponses = Promise.method(function(endpoint) {

  var _this = this;

  return Promise.try(function() {

    // Collect Response Keys
    if (endpoint.endpoint.responses) return Object.keys(endpoint.endpoint.responses);
    else return [];
  })
      .each(function(responseKey) {

        var thisResponse = endpoint.endpoint.responses[responseKey];
        var methodResponseBody = {};

        // Format Response Parameters per APIG API's Expectations
        for (prop in thisResponse.responseParameters) {
          var param = endpoint.endpoint.responseParameters[prop];
          methodResponseBody.responseParameters[param[prop]] = true;
        }

        // Create Method Response
        return _this.ApiClient.putMethodResponse(
            _this._restApiId,
            endpoint.endpoint.apig.resource.id,
            endpoint.endpoint.method,
            thisResponse.statusCode,
            methodResponseBody)
            .then(function() {
              utils.logIfVerbose(
                  'API Gateway: "'
                  + _this._stage + ' - '
                  + _this._region.region
                  + ' - ' + endpoint.endpoint.path + '": '
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
 * Create Endpoint Method Integration Responses
 */
ApiDeployer.prototype._createEndpointMethodIntegResponses = Promise.method(function(endpoint) {

  var _this = this;

  return Promise.try(function() {

    // Collect Response Keys
    if (endpoint.endpoint.responses) return Object.keys(endpoint.endpoint.responses);
    else return [];
  })
      .each(function(responseKey) {

        var thisResponse = endpoint.endpoint.responses[responseKey];
        var integrationResponseBody = {};

        // Add Response Parameters
        integrationResponseBody.responseParameters = thisResponse.responseParameters;

        // Add Response Templates
        integrationResponseBody.responseTemplates = thisResponse.responseTemplates;

        // Add SelectionPattern
        integrationResponseBody.selectionPattern = responseKey === 'default' ? null : responseKey;// null = default

        // Create Integration Response
        return _this.ApiClient.putIntegrationResponse(
            _this._restApiId,
            endpoint.endpoint.apig.resource.id,
            endpoint.endpoint.method,
            thisResponse.statusCode,
            integrationResponseBody)
            .then(function() {
              utils.logIfVerbose(
                  'API Gateway: "'
                  + _this._stage + ' - '
                  + _this._region.region
                  + ' - ' + endpoint.endpoint.path + '": '
                  + 'created method integration response');
            }).catch(function(error) {
              reject(new JawsError(
                  error.message,
                  JawsError.errorCodes.UNKNOWN));
            });
      });
});

/**
 * Create Deployment
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

/**
 *
 * @param JAWS
 */
module.exports = function(JAWS) {

  /**
   * Deploy API
   * @param stage
   * @returns {bluebird|exports|module.exports}
   */
  JAWS.deployApi = function(stage, region, allTagged) {

    // Check region (required)
    if (!region) {
      reject(new JawsError(
          'Must specify a region',
          JawsError.errorCodes.UNKNOWN));
    }

    // Check stage exists
    stage = stage.toLowerCase().trim();
    if (!JAWS._meta.projectJson.project.stages[stage]) {
      reject(new JawsError(
          'The stage "' + stage
          + '" does not exist.  Please generate this stage if you would like to deploy to it.',
          JawsError.errorCodes.UNKNOWN));
    }

    // Check if stage has regions
    if (!JAWS._meta.projectJson.project.stages[stage].length) {
      reject(new JawsError(
          'You do not have any regions set for this stage.  Add one before deploying.',
          JawsError.errorCodes.UNKNOWN));
    }

    // Tag CWD if necessary
    return (allTagged ? Promise.resolve() : JAWS.tag('api', null, false))
        .then(function() {

          // Validate region.  If no region specified, deploy to all regions
          if (!region) {

            var regions = JAWS._meta.projectJson.project.stages[stage];
          } else {

            region = region.toLowerCase().trim();

            for (var i = 0; i < JAWS._meta.projectJson.project.stages[stage].length; i++) {
              var tempRegion = JAWS._meta.projectJson.project.stages[stage][i];
              if (region === tempRegion.region) var regions = [tempRegion];
            }

            // If missing region, throw error
            if (!regions) {
              reject(new JawsError(
                  'The region "' + region + '" does not exist in this stage.',
                  JawsError.errorCodes.UNKNOWN));
            }
          }

          return Promise.resolve(regions);
        })
        .each(function(region) {

          var deployer = new ApiDeployer(
              stage,
              region,
              JAWS._meta.projectRootPath,
              JAWS._meta.projectJson,
              JAWS._meta.credentials
          );
          return deployer.deploy()
              .then(function(url) {
                console.log('API Gateway successfully deployed: ' + url);

                // Untag
                return allTagged ? JAWS.tagAll('api', true) : JAWS.tag('api', null, true);
              });
        });
  };
};
