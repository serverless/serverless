'use strict';

/**
 * Action: VersionLambda
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      BbPromise  = require('bluebird'),
      path       = require('path'),
      JawsUtils  = require('../../utils/index');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class FunctionVersion extends JawsPlugin {

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
    return 'jaws.core.' + FunctionVersion.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.addAction(this.functionVersion.bind(this), {
      handler:       'functionVersion',
      description:   `Version functions at specified paths, or ALL functions
usage: jaws function version [options]... [paths|ALL]...

ex:
  jaws function version ./slss_modules/greetings/hello
  jaws function version`,
      context:       'function',
      contextAction: 'version',
      options:       [
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
   * @param lambdaPaths [] optional abs or rel (to cwd) paths to lambda dirs. If ommitted versions lambda @ cwd
   * @returns {Promise.<Array>}
   */
  functionVersion(event) {
    let _this  = this;
    let evt    = {};
    _this.evt = {};
    
    // If CLI, parse arguments
    if (_this.Jaws.cli) {
      event = _this.Jaws.cli.options;
      event.paths  = _this.Jaws.cli.params;
    } else {
      _this.Jaws._interactive = false;
    }
    
    _this.evt.stage    = event.stage ? event.stage : null;
    _this.evt.regions  = event.region ? [event.region] : [];
    _this.evt.noExeCf  = (event.noExeCf == true || event.noExeCf == 'true');
    _this.evt.paths    = event.paths ? event.paths : [];
    _this.evt.lambdaLogicalIdsToVersion = [];
    
    // Flow    
    return _this.Jaws.validateProject()
        .bind(_this)
        .then(_this._promptStage)
        .then(_this._validateAndPrepare)
        .then(_this._setLambdaLogicalIds)
        .then(_this._publishVersionInRegions);
  }


  /**
   *
   * @returns {Promise}
   * @private
   */
  _promptStage(evt) {
        
        let _this  = this;
        let stages = Object.keys(_this.Jaws._projectJson.stages);
        
        // Skip if non-interactive or stage provided
        if (!_this.Jaws._interactive || _this.evt.stage) return evt;
        
        // if project has 1 stage, skip prompt
        if (stages.length === 1) {
          _this.evt.stage = stages[0];
          return evt;
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
        return _this.selectInput('Function Version - Choose a stage: ', choices, false)
            .then(results => {
              _this.evt.stage = results[0].value;
              return evt;
            });
  }
  

  _validateAndPrepare(evt) {
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
      
      // Check paths
      if (!_this.evt.paths.length) {
        return BbPromise.reject(new JawsError('One or multiple paths are required'));
      }
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

    // Get full paths using the getFunctions() utility
    if (_this.Jaws.cli) {
      if (!_this.evt.paths || !_this.evt.paths.length) {

        // If CLI and no paths, get full paths from CWD
        return JawsUtils.getFunctions(process.cwd(), null)
            .then(function(functions) {

              if (!functions.length) return BbPromise.reject(new JawsError('No Functions Found', JawsError.errorCodes.UNKNOWN));

              _this.evt.functions = functions;
              return evt;
            });
      }
    }
    
    // Otherwise, resolve full paths
    return JawsUtils.getFunctions(_this.Jaws._projectRootPath, _this.evt.paths)
        .then(function(functions) {
          _this.evt.functions = functions;
          return evt;
        });
  }
  

  /**
   *
   * @param lambdaPaths [] optional abs or rel (to cwd) paths to lambda dirs. If ommitted deploys lambda @ cwd
   * @return {Promise}
   * @private
   */
  _setLambdaLogicalIds(evt) {
    
    let _this = this;
    
    JawsUtils.jawsDebug('publishing version for stage:', _this.evt.stage);
    
    _this.evt.lambdaLogicalIdsToVersion = _this.evt.functions.map(awsmJson => {
      return awsmJson.name;
    });

    JawsUtils.jawsDebug('setting _lambdaLogicalIdsToVersion', _this.evt.lambdaLogicalIdsToVersion);
    
    return evt;
  }
  
  _publishVersionInRegions(evt) {
    let _this = this;
    
    JawsCLI.log('Publishing the reqeusted function versions to the requested regions...');
    
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
          return CF.sGetLambdaPhysicalsFromLogicals(_this.evt.lambdaLogicalIdsToVersion, lambdaSummaries);
        })
        .then(lambdaNamesToVersion => {
          return Lambda.sPublishVersions(lambdaNamesToVersion);
        })
        .then(function(versionedLambdas){
          JawsCLI.log('Successfully published the requested function versions to the ' + region + ' region:');
          return versionedLambdas;
        });
    });
  }
}

module.exports = FunctionVersion;
