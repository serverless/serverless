'use strict';

/**
 * Action: EndpointDeploy
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError  = require('../../jaws-error'),
    JawsCLI    = require('../../utils/cli'),
    BbPromise  = require('bluebird'),
    path       = require('path'),
    os         = require('os'),
    AWSUtils   = require('../../utils/aws'),
    JawsUtils  = require('../../utils/index');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class EndpointDeploy extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */
  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + EndpointDeploy.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.endpointDeploy.bind(this), {
      handler:       'endpointDeploy',
      description:   'Deploy one or multiple endpoints',
      context:       'endpoint',
      contextAction: 'deploy',
      options:       [
        {
          option:      'stage',
          shortcut:    's',
          description: 'Optional if only one stage is defined in project'
        }, {
          option:      'region',
          shortcut:    'r',
          description: 'Optional if only one region is defined in stage'
        }
      ],
    });
    return Promise.resolve();
  }

  /**
   * Endpoint Deploy
   * @param endpointAwsmPaths
   * @param stage
   * @param region
   * @returns {Promise.<T>}
   */
  endpointDeploy(stage, region, noExeCf) {

    let _this      = this;
    this._stage    = stage;
    this._region   = region;
    this._noExeCf  = (noExeCf == true || noExeCf == 'true');
    this._endpointAwsmPaths = Array.prototype.slice.call(arguments, 3);


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
          region = JawsUtils.getProjRegionConfigForStage(_this.Jaws._projectJson, _this._stage, region);
          return _this._fetchDeployedLambdas(region);

        });
  }

  /**
   * Fetch deployed lambdas in CF stack
   *
   * @private
   */
  _fetchDeployedLambdas(region) {

    let _this = this;

    return AWSUtils.cfGetLambdaResourceSummaries(
        _this.Jaws._awsProfile,
        region.region,
        AWSUtils.cfGetLambdasStackName(_this._stage, _this.Jaws._projectJson.name)
        )
        .then(lambdas => {
          this._lambdas = lambdas;
          console.log(lambdas);
        })
        .catch(function(e) {
          console.log(e)
        });
  }
}

module.exports = EndpointDeploy;