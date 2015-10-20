'use strict';

/**
 * Action: VersionLambda
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      BbPromise  = require('bluebird'),
      path       = require('path'),
      os         = require('os'),
      AWS        = require('aws-sdk'),
      AWSUtils   = require('../../utils/aws'),
      JawsUtils  = require('../../utils/index');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class VersionLambda extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
    this._stage                    = null;
    this._region                   = null;
    this._noExeCf                  = false;
    this._lambdaAwsmPathsToVersion = [];
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + VersionLambda.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.lambdaPublishVersion.bind(this), {
      handler:       'lambdaPublishVersion',
      description:   'Version lambda at CWD or lambdas at specified paths',
      context:       'lambda',
      contextAction: 'publish-version',
      options:       [
        {
          option:      'stage',
          shortcut:    's',
          description: 'Optional if only one stage is defined in project'
        }, {
          option:      'region',
          shortcut:    'r',
          description: 'Optional. Default is to version lambda in all regions defined in stage'
        }
      ],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param stage Optional if only one stage is defined in project
   * @param region Optional. Default is to version lambda in all regions defined in stage
   * @param lambdaPaths [] optional abs or rel (to cwd) paths to lambda dirs. If ommitted versions lambda @ cwd
   * @returns {Promise.<T>}
   */
  lambdaPublishVersion(stage, region) {
    let _this       = this,
        lambdaPaths = Array.prototype.slice.call(arguments, 3);

    this._stage  = stage;
    this._region = region; //may not be set

    return this._JAWS.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(() => {
        JawsUtils.jawsDebug('publishing version for stage:', _this._stage);
        return _this._setLambdaAwsmPaths(lambdaPaths);
      })
      .then(_this._getRegions)
      .each(region => {

      })
      .then(versionedLambdas => {
        JawsCLI.log('Lambda Deployer:  Successfully published lambda versions to the requested regions!');
        JawsCLI.log(versionedLambdas);
        return versionedLambdas;
      });
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _promptStage() {
    let stages = [],
        _this  = this;

    // If stage exists, skip
    if (!this._stage) {
      stages = Object.keys(_this.JAWS._projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        this._stage = stages[0];
      }
    }

    if (this._stage) { //User specified stage or only one stage
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

    return this.selectInput('VersionLambda:  Choose a stage: ', choices, false)
      .then(results => {
        _this._stage = results[0].value;
      });
  }

  /**
   * this._stage must be set before calling this method
   * @returns {Promise} list of regions
   * @private
   */
  _getRegions() {
    if (this._region) { //user specified specific region to deploy to
      JawsUtils.jawsDebug('Deploying to region: ' + this._region);
      return BbPromise.resolve([region]);
    }

    //Deploy to all regions in stage

    let stage    = this._stage,
        projJson = this.JAWS._projectJson;

    let regionConfigs = projJson.stages[stage],
        regions       = regionConfigs.map(rCfg => {
          return rCfg.region;
        });

    JawsUtils.jawsDebug('Publishing version to regions:', regions);
    return BbPromise.resolve(regions);
  }

  /**
   *
   * @param lambdaPaths [] optional abs or rel (to cwd) paths to lambda dirs. If ommitted deploys lambda @ cwd
   * @return {Promise}
   * @private
   */
  _setLambdaAwsmPaths(lambdaPaths) {
    let _this = this;
    return JawsUtils.getFullLambdaPaths(process.cwd(), lambdaPaths)
      .then(fullAwsmJsonPaths => {
        _this._lambdaAwsmPathsToVersion = fullAwsmJsonPaths;
      });
  }
}

module.exports = VersionLambda;