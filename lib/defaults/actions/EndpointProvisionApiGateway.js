'use strict';

/**
 * Action: Endpoint Provision ApiGateway
 */

const JawsPlugin    = require('../../JawsPlugin'),
    JawsError       = require('../../jaws-error'),
    JawsCLI         = require('../../utils/cli'),
    JawsUtils       = require('../../utils/index'),
    AWSUtils        = require('../../utils/aws'),
    AwsApiGateway   = require('../../utils/aws/ApiGateway'),
    BbPromise       = require('bluebird'),
    path            = require('path'),
    os              = require('os');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class EndpointProvisionApiGateway extends JawsPlugin {

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
    return 'jaws.core.' + EndpointProvisionApiGateway.name;
  }

  /**
   * Register Actions
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.endpointProvisionApiGateway.bind(this), {
      handler:       'endpointProvisionApiGateway',
      description:   'Provision one or multiple endpoints',
    });
    return Promise.resolve();
  }

  /**
   * Endpoint Provision ApiGateway
   * @returns {Promise.<T>}
   */

  endpointProvisionApiGateway() {

    let _this = this;

    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._fetchDeployedLambdas)
        .then(_this._findOrCreateApi)
        .then(_this._getApiResources)
        .then(_this._buildEndpoints)
  }

  _validate() {
    return Promise.resolve();
  }

  /**
   * Fetch deployed lambdas in CF stack
   * @private
   */

  _fetchDeployedLambdas() {

    let _this = this;

    return AWSUtils.cfGetLambdaResourceSummaries(
        _this.Jaws._awsProfile,
        _this.Jaws.ctx.currentRegion.region,
        AWSUtils.cfGetLambdasStackName(
            _this.Jaws.ctx.stage,
            _this.Jaws._projectJson.name)
        )
        .then(lambdas => {
          _this.Jaws.ctx.lambdas = lambdas;
        })
  }

  /**
   * Find Or Create API
   * @returns {*|Promise.<T>}
   * @private
   */

  _findOrCreateApi() {

    let _this = this;

    // Check Project's jaws.json for restApiId, otherwise create an api
    if (_this.Jaws.ctx.currentRegion.restApiId) {

      // Show existing REST API
      return this.ApiClient.showRestApi(_this.Jaws.ctx.currentRegion.restApiId)
          .then(function(response) {

            _this.Jaws.ctx.restApiId = response.id;
            JawsCli.log(
                '"'
                + _this.Jaws.ctx.stage + ' - '
                + _this.Jaws.ctx.currentRegion.region
                + '": found existing REST API on AWS API Gateway with ID: '
                + response.id);
          });

    } else {

      // List all REST APIs
      return AwsApiGateway.getRestApis()
          .then(function(response) {

            // Find REST API w/ same name as project
            for (let i = 0; i < response.items.length;i++) {

              if (response.items[i].name === _this.Jaws._projectJson.name) {
                _this.Jaws.ctx.restApiId = response.items[i].id;

                // Save restApiId to jaws.json for future use
                JawsUtils.saveRegionalApi(
                    _this.Jaws._projectJson,
                    _this.Jaws.ctx.currentRegion.region,
                    _this.Jaws.ctx.restApiId,
                    _this.Jaws._projectRootPath
                );

                JawsUtils.jawsDebug(
                    '"'
                    + _this.Jaws.ctx.stage + ' - '
                    + _this.Jaws.ctx.currentRegion.region
                    + '": found existing REST API on AWS API Gateway with ID: '
                    + _this.Jaws.ctx.restApiId);
                break;
              }
            }

            // If no REST API found, create one
            if (!_this.Jaws.ctx.restApiId) {

              let apiName = _this.Jaws._projectJson.name;
              apiName = apiName.substr(0, 1023); // keep the name length below the limits

              return AwsApiGateway.createRestApi(
                  apiName,
                  _this.Jaws._projectJson.description ? _this.Jaws._projectJson.description : 'A REST API for a JAWS project.'
              ).then(function (response) {

                _this.Jaws.ctx.restApiId = response.id;

                // Save to jaws.json
                JawsUtils.saveRegionalApi(
                    _this.Jaws._projectJson,
                    _this.Jaws.ctx.currentRegion.region,
                    _this.Jaws.ctx.restApiId,
                    _this.Jaws._projectRootPath
                );

                JawsUtils.jawsDebug(
                    '"'
                    + _this.Jaws.ctx.stage + ' - '
                    + _this.Jaws.ctx.currentRegion.region
                    + '": created a new REST API on AWS API Gateway with ID: '
                    + response.id);
              });
            }
          });
    }
  }

  /**
   * Get API Resources
   * @returns {Promise}
   * @private
   */

  _getApiResources() {

    let _this = this;

    // List all Resources for this REST API
    return AwsApiGateway.getResources(_this.Jaws.ctx.restApiId)
        .then(function(response) {

          _this.Jaws.ctx.apiResources = response.items;

          // Get Parent Resource ID
          for (let i = 0; i < _this.Jaws.ctx.apiResources.length; i++) {
            if (_this.Jaws.ctx.apiResources[i].path === '/') {
              _this.Jaws.ctx.apiParentResourceId = _this.Jaws.ctx.apiResources[i].id;
            }
          }

          JawsUtils.jawsDebug(
              '"'
              + _this.Jaws.ctx.stage + ' - '
              + _this.Jaws.ctx.currentRegion.region
              + '": found '
              + _this.Jaws.ctx.apiResources.length
              + ' existing Resources on API Gateway');
        });
  }

  /**
   * Build Endpoints
   * @returns {Promise}
   * @private
   */

  _buildEndpoints() {

    let _this = this;

    return BbPromise.try(function() {
      return _this.Jaws.ctx.services;
    }).each(function(service) {

      return console.log(service);

      //return _this._createEndpointResources(endpoint)
      //    .bind(_this)
      //    .then(_this._createEndpointMethod)
      //    .then(_this._createEndpointIntegration)
      //    .then(_this._manageLambdaAccessPolicy)
      //    .then(_this._createEndpointMethodResponses)
      //    .then(_this._createEndpointMethodIntegResponses)
      //    .then(function() {
      //
      //      // Clean-up hack
      //      // TODO figure out how "apig" temp property is being written to the awsm's json and remove that
      //      if (endpoint.apiGateway.apig) delete endpoint.apiGateway.apig;
      //    });
    });
  }
}

module.exports = EndpointProvisionApiGateway;