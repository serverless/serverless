'use strict';

/**
 * Action: Endpoint Package ApiGateway
 * - Collects endpoint information for provisioning from project function config files
 * - Handles one region only.  The FunctionDeploy Action processes multiple regions by calling this multiple times.
 */

const SPlugin  = require('../ServerlessPlugin'),
    SError     = require('../ServerlessError'),
    SUtils     = require('../utils/index'),
    BbPromise  = require('bluebird'),
    path       = require('path'),
    fs         = require('fs'),
    os         = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class EndpointPackageApiGateway extends SPlugin {

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
    return 'serverless.core.' + EndpointPackageApiGateway.name;
  }

  /**
   * Register Actions
   */

  registerActions() {
    this.S.addAction(this.endpointPrepareApiGateway.bind(this), {
      handler:     'endpointPrepareApiGateway',
      description: 'Package one or multiple endpoints',
    });
    return Promise.resolve();
  }

  /**
   * Handler
   */

  endpointPrepareApiGateway(evt) {

    let _this = this;

    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._createOrGetRestApi)
        .then(function() {
          return evt
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {

    // If endpoint properties are missing, skip
    if (!evt.function.cloudFormation ||
        !evt.function.cloudFormation.apiGateway ||
        !evt.function.cloudFormation.apiGateway.Endpoint) {
      throw new SError(evt.function.name + ' does not have required apiGateway properties');
    }

    evt.endpoints = evt.function.cloudFormation.apiGateway.Endpoint;

    // Endpoint property can be an array to support multiple endpoints per function
    // Convert endpointJson to array, if it's not already
    if (!Array.isArray(evt.endpoints)) evt.endpoints = [evt.endpoints];

    // Validate all evt.endpoints
    for (let i = 0; i < evt.endpoints.length;i++) {

      let e = evt.endpoints[i];

      // Validate and sanitize endpoint attributes
      if (!e.Type
          || !e.Path
          || !e.Method
          || !e.AuthorizationType
          || typeof e.ApiKeyRequired === 'undefined') {
        return BbPromise.reject(new SError('Missing one of many required endpoint attributes: Type, Path, Method, AuthorizationType, ApiKeyRequired'));
      }

      // Sanitize path
      if (e.Path.charAt(0) === '/') e.Path = e.Path.substring(1);

      // Sanitize method
      e.Method = e.Method.toUpperCase();
    }

    return BbPromise.resolve(evt);
  }

  /**
   * Create Or Get REST API for region
   */

  _createOrGetRestApi(evt) {

    let _this = this;

    // Load AWS Service Instance for APIGateway
    let awsConfig    = {
      region:          evt.region.region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };
    let ApiGateway   = require('../utils/aws/ApiGateway')(awsConfig);

    // Load Region JSON
    let regionJson = SUtils.getRegionConfig(
        _this.S._projectJson,
        evt.stage,
        evt.region.region);

    // Check Project's s-project.json for restApiId, otherwise create a REST API in this region.
    if (regionJson.restApiId) {

      let params = {
        restApiId: regionJson.restApiId /* required */
      };

      // Show existing REST API
      return ApiGateway.getRestApiPromised(params)
          .then(function(response) {

            SUtils.sDebug(
                '"'
                + evt.stage + ' - '
                + evt.region.region
                + '": found existing REST API on AWS API Gateway with ID: '
                + response.id);
          });

    } else {

      let params = {
        limit: 500
      };

      // List all REST APIs
      return ApiGateway.getRestApisPromised(params)
          .then(function(response) {

            let restApiId = false;

            // Find REST API w/ same name as project
            for (let i = 0; i < response.items.length;i++) {

              if (response.items[i].name === _this.S._projectJson.name) {

                restApiId = response.items[i].id;

                // Save restApiId to s-project.json for future use
                SUtils.saveRegionalApi(
                    _this.S._projectJson,
                    evt.region.region,
                    restApiId,
                    _this.S._projectRootPath
                );

                SUtils.sDebug(
                    '"'
                    + evt.stage + ' - '
                    + evt.region.region
                    + '": found existing REST API on AWS API Gateway with ID: '
                    + restApiId);

                break;
              }
            }

            if (restApiId) return;

            // If no REST API found, create one
            let apiName = _this.S._projectJson.name;
            apiName = apiName.substr(0, 1023); // keep the name length below the limits

            let params = {
              name: apiName, /* required */
              description: _this.S._projectJson.description ? _this.S._projectJson.description : 'A REST API for a Serverless project.'
            };

            return ApiGateway.createRestApiPromised(params)
                .then(function (response) {

                  // Save RestApiId to s-project.json, fetch it from here later
                  SUtils.saveRegionalApi(
                      _this.S._projectJson,
                      evt.region.region,
                      response.id,
                      _this.S._projectRootPath
                  );

                  SUtils.sDebug(
                      '"'
                      + evt.stage + ' - '
                      + evt.region.region
                      + '": created a new REST API on AWS API Gateway with ID: '
                      + response.id);

                  return;
                });
          });
    }
  }
}

module.exports = EndpointPackageApiGateway;