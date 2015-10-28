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
  constructor(Jaws, config, endpointAwsmPaths, stage, region) {
    super(Jaws, config);
    this._endpointAwsmPaths = endpointAwsmPaths;
    this._stage             = stage;
    this._region            = region;
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

  endpointDeploy() {
    let _this = this;
    return BbPromise.try(function() {

    })
        .bind(_this)
        .then(_this._validate)
        .then(_this._promptStage)
        .then(_this._computeDeployToRegions)
        .then(_this._fetchDeployedLambdas);
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
  });
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
}

module.exports = EndpointDeploy;