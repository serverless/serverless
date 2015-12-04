'use strict';

/**
 * Action: VersionLambda
 */

const SPlugin = require('../ServerlessPlugin'),
      SError  = require('../ServerlessError'),
      SCli    = require('../utils/cli'),
      BbPromise  = require('bluebird'),
      path       = require('path'),
      SUtils  = require('../utils/index');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class FunctionVersion extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Define your plugins name
   */

  static getName() {
    return 'serverless.core.' + FunctionVersion.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.S.addAction(this.functionVersion.bind(this), {
      handler:       'functionVersion',
      description:   `Version functions at specified paths, or ALL functions
usage: serverless function version [options]... [paths|ALL]...

ex:
  serverless function version ./modules/greetings/hello
  serverless function version`,
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
    if (_this.S.cli) {
      event = _this.S.cli.options;
      event.paths  = _this.S.cli.params;
    } else {
      _this.S._interactive = false;
    }
    
    _this.evt.stage    = event.stage ? event.stage : null;
    _this.evt.regions  = event.region ? [event.region] : [];
    _this.evt.noExeCf  = (event.noExeCf == true || event.noExeCf == 'true');
    _this.evt.paths    = event.paths ? event.paths : [];
    _this.evt.lambdaLogicalIdsToVersion = [];
    
    // Flow    
    return _this.S.validateProject()
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
        let stages = Object.keys(_this.S._projectJson.stages);
        
        // Skip if non-interactive or stage provided
        if (!_this.S._interactive || _this.evt.stage) return evt;
        
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
    if (!_this.S._interactive) {

      // Check API Keys
      if (!_this.S._awsProfile) {
        if (!_this.S._awsAdminKeyId || !_this.S._awsAdminSecretKey) {
          return BbPromise.reject(new SError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
        }
      }
      // Check Params
      if (!_this.evt.stage) {
        return BbPromise.reject(new SError('Missing stage'));
      }
      
      // Check paths
      if (!_this.evt.paths.length) {
        return BbPromise.reject(new SError('One or multiple paths are required'));
      }
    }
    
    // validate stage: make sure stage exists
    if (!_this.S._projectJson.stages[_this.evt.stage]) {
      return BbPromise.reject(new SError('Stage ' + _this.evt.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
    }

    // If no region specified, deploy to all regions in stage
    if (!_this.evt.regions.length) {
      _this.evt.regions  = _this.S._projectJson.stages[_this.evt.stage].map(rCfg => {
        return rCfg.region;
      });
    }

    SUtils.sDebug('Queued regions: ' + _this.evt.regions);

    // Get full paths using the getFunctions() utility
    if (_this.S.cli) {
      if (!_this.evt.paths || !_this.evt.paths.length) {

        // If CLI and no paths, get full paths from CWD
        return SUtils.getFunctions(process.cwd(), null)
            .then(function(functions) {

              if (!functions.length) return BbPromise.reject(new SError('No Functions Found', SError.errorCodes.UNKNOWN));

              _this.evt.functions = functions;
              return evt;
            });
      }
    }
    
    // Otherwise, resolve full paths
    return SUtils.getFunctions(_this.S._projectRootPath, _this.evt.paths)
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
    
    SUtils.sDebug('publishing version for stage:', _this.evt.stage);
    
    _this.evt.lambdaLogicalIdsToVersion = _this.evt.functions.map(awsmJson => {
      return awsmJson.name;
    });

    SUtils.sDebug('setting _lambdaLogicalIdsToVersion', _this.evt.lambdaLogicalIdsToVersion);
    
    return evt;
  }
  
  _publishVersionInRegions(evt) {
    let _this = this;
    
    SCli.log('Publishing the reqeusted function versions to the requested regions...');
    
    _this.evt.regions.forEach(region => {

      let awsConfig = {
        region : region,
        profile: _this._awsProfile,
      };

      let CF = require('../utils/aws/CloudFormation')(awsConfig);
      let Lambda = require('../utils/aws/Lambda')(awsConfig);

      let lStackName = CF.sGetLambdasStackName(_this.evt.stage, _this.S._projectJson.name);
      
      return CF.sGetLambdaResourceSummaries(lStackName)
        .then(lambdaSummaries => {
          return CF.sGetLambdaPhysicalsFromLogicals(_this.evt.lambdaLogicalIdsToVersion, lambdaSummaries);
        })
        .then(lambdaNamesToVersion => {
          return Lambda.sPublishVersions(lambdaNamesToVersion);
        })
        .then(function(versionedLambdas){
          SCli.log('Successfully published the requested function versions to the ' + region + ' region:');
          return versionedLambdas;
        });
    });
  }
}

module.exports = FunctionVersion;
