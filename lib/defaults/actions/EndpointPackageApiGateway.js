'use strict';

/**
 * Action: Endpoint Package ApiGateway
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
   * @returns {Promise.<T>}
   */

  endpointPackageApiGateway(evt) {

    let _this = this;
    _this.evt = evt;

    return _this._validate()
        .bind(_this)
        .then(function() {
          return _this.evt;
        });
  }

  /**
   * Validate Endpoints
   * @returns {*}
   * @private
   */

  _validate() {

    let _this = this;

    // Loop through functionPaths
    for (let i = 0; i < _this.evt.functions.length; i++) {

      // Require function config
      let functionJson = require(_this.evt.functions[i]);

      // Skip Function if it does not have an endpoint
      let e;
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