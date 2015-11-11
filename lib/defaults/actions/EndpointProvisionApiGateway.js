'use strict';

/**
 * Action: EndpointProvisionApiGateway
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
   * @param endpointAwsmPaths
   * @param stage
   * @param region
   * @returns {Promise.<T>}
   */

  endpointProvisionApiGateway(stage, region, noExeCf) {

    let _this           = this;
    this._stage         = stage;
    this._region        = region;
    this._noExeCf       = (noExeCf == true || noExeCf == 'true');
    this._servicePaths  = Array.prototype.slice.call(arguments, 3);

    // Resolve full paths for services
    if (this._servicePaths) {
      this._servicePaths = JawsUtils.getServices(
          _this.Jaws._projectRootPath,
          'endpoint',
          this._servicePaths
      );
    }

    return console.log(this._servicePaths);

    // TODO: If no servicePaths, check if interactive, check if in a service, deploy that, or throw error


    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._validate)
        .then(_this._promptStage)
        .then(_this._computeDeployToRegions)
        .then(_this._deployRegions);
  }

  _validate() {
    return Promise.resolve();
  }

  /**
   *
   * @returns {Promise}
   * @private
   */

  _promptStage() {
    let stages = [],
        _this  = this;

    if (!_this._stage) {
      stages = Object.keys(_this.Jaws._projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        _this._stage = stages[0];
      }
    } else {

      // If user provided stage, skip prompt
      return Promise.resolve();
    }

    // Create Choices
    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key:   '',
        value: stages[i],
        label: stages[i],
      });
    }

    return _this.selectInput('Endpoint Deployer – Choose a stage: ', choices, false)
        .then(results => {
          _this._stage = results[0].value;
        });
  }

  /**
   * this._stage must be set before calling this method
   *
   * @returns {Promise} list of regions
   * @private
   */
  _computeDeployToRegions() {

    if (this._region) { //user specified specific region to deploy to
      this._deployToRegions = [this._region];
    } else {
      //Deploy to all regions in stage
      let stage         = this._stage,
          projJson      = this.Jaws._projectJson,
          regionConfigs = projJson.stages[stage];

      this._deployToRegions = regionConfigs.map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Setting deploy to regions:');
    JawsUtils.jawsDebug(this._deployToRegions);
    return BbPromise.resolve(this._deployToRegions);
  }

  _deployRegions() {

    let _this = this;

    return BbPromise.try(function() {
          return _this._deployToRegions;
        })
        .each(function(region) {

          // Deploy endpoints to each region
          _this._regionJson = JawsUtils.getProjRegionConfigForStage(_this.Jaws._projectJson, _this._stage, region);

          return _this._fetchDeployedLambdas()
              .bind(_this)
              .then(_this._findOrCreateApi)
              .then(_this._getApiResources)
              .then(_this._buildEndpoints);
        });
  }

  /**
   * Fetch deployed lambdas in CF stack
   *
   * @private
   */
  _fetchDeployedLambdas() {

    let _this = this;

    return AWSUtils.cfGetLambdaResourceSummaries(
        _this.Jaws._awsProfile,
        _this._regionJson.region,
        AWSUtils.cfGetLambdasStackName(_this._stage, _this.Jaws._projectJson.name)
        )
        .then(lambdas => {
          this._lambdas = lambdas;
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
    if (_this._regionJson.restApiId) {

      // Show existing REST API
      return this.ApiClient.showRestApi(_this._restApiId)
          .then(function(response) {

            _this._restApiId = response.id;
            JawsCli.log(
                'Endpoint Deployer:  "'
                + _this._stage + ' - '
                + _this._regionJson.region
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
                _this._restApiId = response.items[i].id;

                // Save to jaws.json
                JawsUtils.saveRegionalApi(_this.Jaws._projectJson, _this._region, _this._restApiId, _this.Jaws._projectRootPath);
                break;
              }
            }

            // If no REST API found, create one
            if (!_this._restApiId) {

              let apiName = _this.Jaws._projectJson.name;
              apiName = apiName.substr(0, 1023); // keep the name length below the limits

              return AwsApiGateway.createRestApi(
                  apiName,
                  _this.Jaws._projectJson.description ? _this.Jaws._projectJson.description : 'A REST API for a JAWS project.'
              ).then(function (response) {

                _this._restApiId = response.id;

                // Save to jaws.json
                JawsUtils.saveRegionalApi(_this.Jaws._projectJson, _this._region, _this._restApiId, _this.Jaws._projectRootPath);

                JawsCLI.log(
                    'Endpoint Deployer:  "'
                    + _this._stage + ' - '
                    + _this._regionJson.region
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
    return AwsApiGateway.getResources(_this._restApiId)
        .then(function(response) {

          _this._resources = response.items;

          // Get Parent Resource ID
          for (let i = 0; i < _this._resources.length; i++) {
            if (_this._resources[i].path === '/') {
              _this._parentResourceId = _this._resources[i].id;
            }
          }

          JawsCLI.log(
              'Endpoint Deployer:  "'
              + _this._stage + ' - '
              + _this._regionJson.region
              + '": found '
              + _this._resources.length
              + ' existing resources on API Gateway');
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
      return _this._servicePaths;
    }).each(function(servicePath) {



      return console.log(service);

      return _this._createEndpointResources(endpoint)
          .bind(_this)
          .then(_this._createEndpointMethod)
          .then(_this._createEndpointIntegration)
          .then(_this._manageLambdaAccessPolicy)
          .then(_this._createEndpointMethodResponses)
          .then(_this._createEndpointMethodIntegResponses)
          .then(function() {

            // Clean-up hack
            // TODO figure out how "apig" temp property is being written to the awsm's json and remove that
            if (endpoint.apiGateway.apig) delete endpoint.apiGateway.apig;
          });
    });
  }
}

module.exports = EndpointProvisionApiGateway;