'use strict';

/**
 * Action: AliasLambda
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

class AliasLambda extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
    this._stage                   = null;
    this._region                  = null;
    this._lambdaLogicalIdsToAlias = [];
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + AliasLambda.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.lambdaCreateAlias.bind(this), {
      handler:       'lambdaCreateAlias',
      description:   `Create alias for lambda at CWD.  If 'GREATEST' is specified for <version>, the highest version number for the lambda will be used.

usage: jaws lambda alias <version|GREATEST> <aliasName>`,
      context:       'lambda',
      contextAction: 'create-alias',
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
   * @param version If 'GREATEST' is specified the highest version number for the lambda will be used.
   * @param aliasName
   * @returns {Promise.<Array>}
   */
  lambdaCreateAlias(stage, region, version, aliasName) {
    let _this = this;

    if (!version || !aliasName) {
      return Promise.reject(new JawsError('Must specify a lambda version and alias name'));
    }

    this._stage  = stage;
    this._region = region; //may not be set

    JawsUtils.jawsDebug(`Preparing to version ${version} to alias ${aliasName} for stage:`, _this._stage);

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(_this._setLambdaLogicalIds)
      .then(_this._getRegions)
      .each(region => {
        //1) For each region, get all the lambdas for stack
        let lStackName = AWSUtils.cfGetLambdasStackName(_this._stage, _this.Jaws._projectJson.name);
        return AWSUtils.cfGetLambdaResourceSummaries(_this.Jaws._awsProfile, region, lStackName)
          .then(lambdaSummaries => {
            //2) identify physical function names from logical
            return AWSUtils.cfGetLambdaPhysicalsFromLogicals(_this._lambdaLogicalIdsToAlias, lambdaSummaries);
          })
          .then(lambdaNamesToAlias => {
            let defered;

            if ((version + '').toLowerCase() == 'greatest') {
              defered = AWSUtils.lambdaGetGreatestVersion(_this.Jaws._awsProfile, region, lambdaNamesToAlias[0]);
            } else {
              defered = Promise.resolve(version);
            }

            //3) create alias (should only be one lambda name, as we only support aliasing one lambda at a time)
            return defered.then(fromVer => {
              return AWSUtils.lambdaCreateAlias(_this.Jaws._awsProfile, region, lambdaNamesToAlias[0], fromVer, aliasName)
            });
          });
      })
      .then(aliasedLambda => {
        JawsCLI.log('Lambda Alias:  Successfully aliased lambda in requested regions:');
        JawsCLI.log(aliasedLambda);
        return aliasedLambda;
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
      stages = Object.keys(_this.Jaws._projectJson.stage);

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

    return this.selectInput('AliasLambda:  Choose a stage: ', choices, false)
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
        projJson = this.Jaws._projectJson;

    let regionConfigs = projJson.stage[stage],
        regions       = regionConfigs.map(rCfg => {
          return rCfg.region;
        });

    JawsUtils.jawsDebug('Publishing alias to regions:', regions);
    return BbPromise.resolve(regions);
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  _setLambdaLogicalIds() {
    let _this = this;
    return JawsUtils.getFullServicePaths(process.cwd(), [])  //leaving here for to be created GREATEST and 'ALL' option
      .then(fullAwsmJsonPaths => {
        _this._lambdaLogicalIdsToAlias = fullAwsmJsonPaths.map(alp => {
          let awsmJson = JawsUtils.readAndParseJsonSync(alp);
          return JawsUtils.getLambdaName(awsmJson);
        });
      });
  }
}

module.exports = AliasLambda;