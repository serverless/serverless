'use strict';

/**
 * Action: Endpoint Deploy ApiGateway
 * - Creates a new API Gateway Deployment
 * - Handles one region only.  The FunctionDeploy Action processes multiple regions by calling this multiple times.
 */

module.exports = function(SPlugin, serverlessPath) {
  const path     = require('path'),
      SError     = require(path.join(serverlessPath, 'Error')),
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
        description: 'Creates an API Gateway deployment in a region'
      });
      return Promise.resolve();
    }

    /**
     * Handler
     */

    endpointDeployApiGateway(evt) {

      let _this     = this;
      _this.evt     = evt;

      _this.aws = _this.S.getProvider();

      return _this._validateAndPrepare()
          .bind(_this)
          .then(_this._createDeployment)
          .then(function() {

            /**
             * Return EVT
             */

            _this.evt.data.deploymentId = _this.deployment.id;
            return _this.evt;

          });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {
      return BbPromise.resolve();
    }

    /**
     * Create Deployment
     */

    _createDeployment() {

      let _this = this;

      return new BbPromise( function( resolve, reject ){

        let doDeploy = function() {

          let params = {
            restApiId:        _this.evt.options.restApiId, /* required */
            stageName:        _this.evt.options.stage, /* required */
            //cacheClusterEnabled:  false, TODO: Implement
            //cacheClusterSize: '0.5 | 1.6 | 6.1 | 13.5 | 28.4 | 58.2 | 118 | 237', TODO: Implement
            description:      _this.evt.options.description || 'Serverless deployment',
            stageDescription: _this.evt.options.stage,
            variables: {
              functionAlias:  _this.evt.options.stage
            }
          };

          _this.aws.request('APIGateway', 'createDeployment', params, _this.evt.options.stage, _this.evt.options.region)
            .then(function(response) {

              _this.deployment = response;

              SUtils.sDebug(
                '"'
                + _this.evt.options.stage
                + ' - '
                + _this.evt.options.region
                + ' - REST API: '
                + 'created API Gateway deployment: '
                + response.id);

              return resolve();
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