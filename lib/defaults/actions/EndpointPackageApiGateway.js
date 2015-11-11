'use strict';

/**
 * Action: EndpointPackageApiGateway
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError  = require('../../jaws-error'),
    JawsCLI    = require('../../utils/cli'),
    JawsUtils  = require('../../utils/index'),
    AWSUtils   = require('../../utils/aws'),
    BbPromise  = require('bluebird'),
    path       = require('path'),
    os         = require('os');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class EndpointPackageApiGateway extends JawsPlugin {

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
    return 'jaws.core.' + EndpointPackageApiGateway.name;
  }

  /**
   * Register Actions
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.endpointPackageApiGateway.bind(this), {
      handler:       'endpointPackageApiGateway',
      description:   'Package one or multiple endpoints',
    });
    return Promise.resolve();
  }

  /**
   * Endpoint Package
   * @param servicePaths
   * @returns {Promise.<T>}
   */

  endpointPackageApiGateway(servicePaths) {
    this._servicePaths = servicePaths;
    this._serviceJsons = [];
    return this._validateAndSanitize();
  }

  /**
   * Validate Endpoints
   * @returns {*}
   * @private
   */

  _validateAndSanitize() {

    let _this = this;

    // Loop through servicePaths
    for (let i = 0; i < _this._servicePaths.length; i++) {

      // Require service config
      let serviceJson = require(_this._servicePaths[i]);

      // Skip Endpoint if it does not exist
      let e;
      try {
        e = serviceJson.cloudFormation.apiGateway.Endpoint;
      } catch(error) {
        continue;
      }

      // Validate attributes
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

      // Push to final array
      _this._serviceJsons.push(serviceJson);
    }

    return Promise.resolve();
  }
}

module.exports = EndpointPackageApiGateway;