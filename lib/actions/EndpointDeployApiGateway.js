'use strict';

/**
 * Action: Endpoint Deploy ApiGateway
 * - Creates a new API Gateway Deployment
 * - Handles one region only.  The FunctionDeploy Action processes multiple regions by calling this multiple times.
 */

module.exports = function(SPlugin, serverlessPath) {
  const path     = require('path'),
      SError     = require(path.join(serverlessPath, 'ServerlessError')),
      SUtils     = require(path.join(serverlessPath, 'utils/index')),
      BbPromise  = require('bluebird'),
      fs         = require('fs');

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class EndpointDeployApiGateway extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EndpointDeployApiGateway.name;
    }

    registerActions() {
      this.S.addAction(this.endpointDeployApiGateway.bind(this), {
        handler:     'endpointDeployApiGateway',
        description: 'Creates an API Gateway deployment in a region',
      });
      return Promise.resolve();
    }

    /**
     * Handler
     */

    endpointDeployApiGateway(evt) {

      let _this = this;

      // Load AWS Service Instances
      let awsConfig = {
        region:          evt.region.region,
        accessKeyId:     _this.S._awsAdminKeyId,
        secretAccessKey: _this.S._awsAdminSecretKey,
      };

      _this.ApiGateway   = require('../utils/aws/ApiGateway')(awsConfig);

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

      return new BbPromise( function( resolve, reject ){
        let doDeploy = function(){
          let params = {
            restApiId:    evt.region.restApiId, /* required */
            stageName:    evt.stage, /* required */
            //cacheClusterEnabled:  false, TODO: Implement
            //cacheClusterSize: '0.5 | 1.6 | 6.1 | 13.5 | 28.4 | 58.2 | 118 | 237', TODO: Implement
            description: 'Serverless deployment',
            stageDescription: evt.stage,
            variables: {
              functionAlias: evt.stage
            }
          };

          _this.ApiGateway.createDeploymentPromised(params)
          .then(function(response) {
            evt.deployment = response;

            SUtils.sDebug(
              '"'
              + evt.stage + ' - '
              + evt.region.region
              + ' - REST API: '
              + 'created API Gateway deployment: '
              + response.id);

            return resolve( evt );
          })
          .catch(function(error) {
            if( error.statusCode == 429 ) {
              console.log("'Too many requests' received, sleeping 5 seconds");
              setTimeout( doDeploy, 5000 );
            } else
              reject( new SError(error.message) );
          });
        };

        doDeploy();
      });
    }
  }

  return( EndpointDeployApiGateway );
};
