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

    endpointDeployApiGateway(options) {

      let _this     = this;
      _this.options = options || {};

      // Load AWS Service Instances
      let awsConfig = {
        region:          _this.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.ApiGateway   = require('../utils/aws/ApiGateway')(awsConfig);

      return _this._validateAndPrepare()
          .bind(_this)
          .then(_this._createDeployment)
          .then(function() {


            // TODO: Return something!



          });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {

      let _this = this;

      // Instantiate Classes
      _this.project    = new _this.S.classes.Project(_this.S);
      _this.meta       = new _this.S.classes.Meta(_this.S);

      return BbPromise.resolve();
    }

    /**
     * Create Deployment
     */

    _createDeployment() {

      let _this = this;

      return new BbPromise( function( resolve, reject ){

        let doDeploy = function(){

          let params = {
            restApiId:        _this.meta.data.private.stages[_this.options.stage].regions[_this.options.region].variables.apiGatewayApi, /* required */
            stageName:        _this.options.stage, /* required */
            //cacheClusterEnabled:  false, TODO: Implement
            //cacheClusterSize: '0.5 | 1.6 | 6.1 | 13.5 | 28.4 | 58.2 | 118 | 237', TODO: Implement
            description:      _this.options.description || 'Serverless deployment',
            stageDescription: _this.options.stage,
            variables: {
              functionAlias:  _this.options.stage
            }
          };

          _this.ApiGateway.createDeploymentPromised(params)
          .then(function(response) {
            _this.deployment = response;

            SUtils.sDebug(
              '"'
              + _this.options.stage + ' - '
              + _this.options.region
              + ' - REST API: '
              + 'created API Gateway deployment: '
              + response.id);

            return resolve( evt );
          })
          .catch(function(error) {
            if( error.statusCode == 429 ) {
              SUtils.sDebug("'Too many requests' received, sleeping 5 seconds");
              setTimeout( doDeploy, 5000 );
            } else
              reject( new SError(error.message) );
          });
        };

        return doDeploy();
      });
    }
  }

  return( EndpointDeployApiGateway );
};
