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
    this.S.addAction(this.endpointPackageApiGateway.bind(this), {
      handler:       'endpointPackageApiGateway',
      description:   'Package one or multiple endpoints',
    });
    return Promise.resolve();
  }

  /**
   * Handler
   */

  endpointPackageApiGateway(evt) {

    let _this = this;

    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(function() {
          return evt
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {

    let _this = this;

    // Get Function JSON
    return SUtils.getFunctions(
        _this.S._projectRootPath,
        [evt.function])
        .then(function(functionJsons) {

          // Attach to evt
          evt.function = functionJsons[0];

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
          for (let i=0; i < evt.endpoints.length;i++) {

            let e = evt.endpoints[i];

            // Validate and sanitize endpoint attributes
            if (!e.Type
                || !e.Path
                || !e.Method
                || !e.AuthorizationType
                || typeof e.ApiKeyRequired === 'undefined') {
              return BbPromise.reject(new SError(
                  'Missing one of many required endpoint attributes: Type, Path, Method, AuthorizationType, ApiKeyRequired',
                  SError.errorCodes.UNKNOWN));
            }

            // Sanitize path
            if (e.Path.charAt(0) === '/') e.Path = e.Path.substring(1);

            // Sanitize method
            e.Method = e.Method.toUpperCase();
          }

          return evt;
        });
  }
}

module.exports = EndpointPackageApiGateway;