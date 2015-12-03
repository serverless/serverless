'use strict';

/**
 * Action: Endpoint Provision ApiGateway
 * - Creates a new API Gateway Deployment
 * - Handles one region only.  The FunctionDeploy Action processes multiple regions by calling this multiple times.
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsUtils  = require('../../utils/index'),
    JawsError  = require('../../jaws-error'),
    BbPromise  = require('bluebird'),
    path       = require('path'),
    fs         = require('fs'),
    os         = require('os');

// Promisify fs module
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
      handler:     'endpointProvisionApiGateway',
      description: 'Creates an API Gateway deployment in a region',
    });
    return Promise.resolve();
  }

  /**
   * Handler
   */

  endpointProvisionApiGateway(evt) {

    let _this = this;

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };

    _this.ApiGateway     = require('../../utils/aws/ApiGateway')(awsConfig);

    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._createDeployment)
        .then(function() {
          return evt
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {
    return BbPromise.resolve(evt);
  }

  /**
   * Create Deployment
   */

  _createDeployment(evt) {

    let _this       = this;

    let params = {
      restApiId:    evt.region.restApiId, /* required */
      stageName:    evt.stage, /* required */
      //cacheClusterEnabled:  false, TODO: Implement
      //cacheClusterSize: '0.5 | 1.6 | 6.1 | 13.5 | 28.4 | 58.2 | 118 | 237', TODO: Implement
      description: 'JAWS deployment',
      stageDescription: evt.stage,
      //variables: { TODO: Implement
      //  someKey: 'STRING_VALUE',
      //  /* anotherKey: ... */
      //}
    };

    return _this.ApiGateway.createDeploymentPromised(params)
        .then(function(response) {
          evt.deployment = response;
          return evt;
        })
        .catch(function(error) {
          throw new JawsError(error.message);
        });
  }
}

module.exports = EndpointProvisionApiGateway;