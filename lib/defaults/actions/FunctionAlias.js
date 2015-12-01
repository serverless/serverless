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
      JawsUtils  = require('../../utils/index');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class FunctionAlias extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
    this.evt = {};
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + FunctionAlias.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.addAction(this.functionAlias.bind(this), {
      handler:       'functionAlias',
      description:   `Create alias for a function at a specified paths, or ALL functions.
usage: jaws function alias <version> <aliasName>`,
      context:       'function',
      contextAction: 'alias',
      options:       [
        {
          option:      'version',
          shortcut:    'v',
          description: 'The lambda version to alias'
        },
        {
          option:      'alias',
          shortcut:    'a',
          description: 'The alias name of the specified version'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'Optional if only one stage is defined in project'
        },
        {
          option:      'region',
          shortcut:    'r',
          description: 'Optional. Default is to version lambda in all regions defined in stage'
        },
        {
          option:      'nonInteractive',
          shortcut:    'i',
          description: 'Optional - Turn off CLI interactivity if true. Default: false'
        }
      ],
    });
    return BbPromise.resolve();
  }

  /**
   *
   * @param stage Optional if only one stage is defined in project
   * @param region Optional. Default is to version lambda in all regions defined in stage
   * @param version If 'GREATEST' is specified the highest version number for the lambda will be used.
   * @param aliasName
   * @returns {Promise.<Array>}
   */
  functionAlias(evt) {
      let _this  = this;
      
      // If CLI, parse arguments
      if (_this.Jaws.cli) {
        evt = _this.Jaws.cli.options;
      } else {
        _this.Jaws._interactive = false;
      }
      
      _this.evt          = evt;
      _this.evt.stage    = evt.stage ? evt.stage : null;
      _this.evt.regions  = evt.region ? [evt.region] : [];
      _this.evt.noExeCf  = (evt.noExeCf == true || evt.noExeCf == 'true');
      _this.evt.lambdaLogicalIdsToAlias = [JawsUtils.readAndParseJsonSync(path.join(process.cwd(), 'lambda.awsm.json')).name];
      
      // Flow    
      return _this.Jaws.validateProject()
          .bind(_this)
          .then(_this._promptStage)
          .then(_this._validateAndPrepare)
          .then(_this._createAliasInRegions);
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _promptStage() {
    
    let _this  = this;
    let stages = Object.keys(_this.Jaws._projectJson.stages);
    
    // Skip if non-interactive or stage provided
    if (!_this.Jaws._interactive || _this.evt.stage) return BbPromise.resolve();;
    
    // if project has 1 stage, skip prompt
    if (stages.length === 1) {
      _this.evt.stage = stages[0];
      return BbPromise.resolve();
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

    // Show prompt
    return _this.selectInput('Function Alias - Choose a stage: ', choices, false)
        .then(results => {
          _this.evt.stage = results[0].value;
          return BbPromise.resolve();
        });
  } 
      
  _validateAndPrepare() {
      let _this = this;
      // non interactive validation
      if (!_this.Jaws._interactive) {

        // Check API Keys
        if (!_this.Jaws._awsProfile) {
          if (!_this.Jaws._awsAdminKeyId || !_this.Jaws._awsAdminSecretKey) {
            return BbPromise.reject(new JawsError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
          }
        }
        // Check Params
        if (!_this.evt.stage) {
          return BbPromise.reject(new JawsError('Missing stage'));
        }
      }
      
      if (!_this.evt.alias || !_this.evt.version) {
        return BbPromise.reject(new JawsError('Missing version or alias'));
      }
      
      // validate stage: make sure stage exists
      if (!_this.Jaws._projectJson.stages[_this.evt.stage]) {
        return BbPromise.reject(new JawsError('Stage ' + _this.evt.stage + ' does not exist in your project', JawsError.errorCodes.UNKNOWN));
      }

      // If no region specified, deploy to all regions in stage
      if (!_this.evt.regions.length) {
        _this.evt.regions  = _this.Jaws._projectJson.stages[_this.evt.stage].map(rCfg => {
          return rCfg.region;
        });
      }

      JawsUtils.jawsDebug('Queued regions: ' + _this.evt.regions);
      
      return BbPromise.resolve();
  }
  
  _createAliasInRegions() {
    let _this = this;
    
    JawsCLI.log('Aliasing function in the requested regions...');
    
    _this.evt.regions.forEach(region => {
      
      let awsConfig = {
        region : region,
        profile: _this._awsProfile,
      };

      let CF = require('../../utils/aws/CloudFormation')(awsConfig);
      let Lambda = require('../../utils/aws/Lambda')(awsConfig);

      let lStackName = CF.sGetLambdasStackName(_this.evt.stage, _this.Jaws._projectJson.name);
      
      return CF.sGetLambdaResourceSummaries(lStackName)
        .then(lambdaSummaries => {
          return CF.sGetLambdaPhysicalsFromLogicals(_this.evt.lambdaLogicalIdsToAlias, lambdaSummaries);
        })
        .then(lambdaNamesToAlias => {
            return Lambda.sCreateAlias(lambdaNamesToAlias[0], _this.evt.version, _this.evt.alias);
        })
        .then(function(aliasedLambda){
          JawsCLI.log('Successfully aliased function in the ' + region + ' region.');
          return aliasedLambda;
        });
    });
  }
}

module.exports = FunctionAlias;
