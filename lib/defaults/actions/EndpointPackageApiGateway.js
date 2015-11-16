'use strict';

/**
 * Action: Endpoint Package ApiGateway
 * - Collects endpoint information for provisioning from project function config files
 * - Handles one region only.  The FunctionDeploy Action processes multiple regions by calling this multiple times.
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError  = require('../../jaws-error'),
    BbPromise  = require('bluebird'),
    path       = require('path'),
    fs         = require('fs'),
    os         = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class EndpointPackageApiGateway extends JawsPlugin {

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
    return 'jaws.core.' + EndpointPackageApiGateway.name;
  }

  /**
   * Register Actions
   */

  registerActions() {
    this.Jaws.addAction(this.endpointPackageApiGateway.bind(this), {
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
    _this.evt = evt;

    return _this._validateAndPrepare()
        .bind(_this)
        .then(function() {
          return _this.evt;
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare() {

    let _this = this;

    // Loop through function paths
    for (let i = 0; i < _this.evt.functions.length; i++) {

      let e;

      // Require function config
      let functionJson = require(_this.evt.functions[i]);

      // Skip Function if it does not have an endpoint

      try {
        e = functionJson.cloudFormation.apiGateway.Endpoint;
      } catch(error) {
        _this.evt.functions.splice(i,1);
        continue;
      }

      // Validate endpoint attributes
      if (!e.Type
          || !e.Path
          || !e.Method
          || !e.AuthorizationType
          || typeof e.ApiKeyRequired === 'undefined') {
        return Promise.reject(new JawsError(
            'Missing one of many required endpoint attributes: Type, Path, Method, AuthorizationType, ApiKeyRequired',
            JawsError.errorCodes.UNKNOWN));
      }

      // Sanitize path
      if (e.Path.charAt(0) === '/') e.Path = e.Path.substring(1);

      // Sanitize method
      e.Method = e.Method.toUpperCase();

      // Add function path to functionJson
      functionJson.path = _this.evt.functions[i];

      // Change function path to object
      _this.evt.functions[i] = functionJson;
    }

    return BbPromise.resolve();
  }
}

module.exports = EndpointPackageApiGateway;