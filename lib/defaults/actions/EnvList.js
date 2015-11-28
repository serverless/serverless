'use strict';

/**
 * Action: EnvList
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      chalk      = require('chalk'),
      BbPromise  = require('bluebird'),
      awsMisc    = require('../../utils/aws/Misc'),
      JawsUtils  = require('../../utils');

/**
 * EnvList Class
 */

class EnvList extends JawsPlugin {

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
    return 'jaws.core.' + EnvList.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.addAction(this.envList.bind(this), {
      handler:       'envList',
      description:   `List env vars for stage and region.  Region can be 'all'
usage: jaws env list`,
      context:       'env',
      contextAction: 'list',
      options:       [
        {
          option:      'region',
          shortcut:    'r',
          description: 'region you want to list env vars for'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'stage you want to list env vars for'
        },
        {
          option:      'nonInteractive',
          shortcut:    'i',
          description: 'Optional - Turn off CLI interactivity if true. Default: false'
        },
      ],
    });
    return BbPromise.resolve();
  }

  /**
   * Action
   */
  envList(evt) {
    let _this = this;

    if(evt) {
      _this.evt = evt;
      _this.Jaws._interactive = false;
    }

    // If CLI, parse arguments
    if (_this.Jaws.cli) {
      _this.evt = _this.Jaws.cli.options;
      
      if (_this.Jaws.cli.options.nonInteractive) {
        _this.Jaws._interactive = false;
      }
    }

    return _this.Jaws.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(_this._promptRegion)
      .then(_this._validateAndPrepare)
      .then(_this._listEnvVars);
    }

    /**
     * Prompt stage if it's missing
     */
    _promptStage() {
      let _this = this;
      let stages = Object.keys(_this.Jaws._projectJson.stages);


      // Skip if non-interactive
      if (!_this.Jaws._interactive || _this.evt.stage) return BbPromise.resolve();

      // if project has 1 stage, skip prompt
      if (stages.length === 1) {
        _this.evt.stage = stages[0];
        return BbPromise.resolve();
      }
      // add local stage
      stages.push('local');

      // Create Choices
      let choices = [];
      for (let i = 0; i < stages.length; i++) {
        choices.push({
          key:   (i + 1) + ') ',
          value: stages[i],
          label: stages[i],
        });
      }

      return JawsCLI.select('Which stage are you listing env vars for: ', choices, false)
        .then(function(results) {
          _this.evt.stage = results[0].value;
        });
    }
    
    /**
     * Prompt region if it's missing
     */
    _promptRegion() {
      let _this = this;

      // skip region prompt if selected stage is 'local'
      if (_this.evt.stage === 'local') {
        _this.evt.region = 'local';
        return BbPromise.resolve();
      }

      if (!_this.Jaws._interactive || _this.evt.region) return BbPromise.resolve();
      
      // TODO: list only regions defined in the provided Stage
      //       this assumres that the provided stage is valid, we'll have to validate before getting here
      let choices = awsMisc.validLambdaRegions.map(r => {
        return {
          key:   '',
          value: r,
          label: r,
        };
      });
      
      // adding all regions
      choices.push(
        {
          key:   '',
          value: 'all',
          label: 'all',  
        }
      );

      return _this.selectInput('Select a region for your stage: ', choices, false)
        .then(results => {
          _this.evt.region = results[0].value;
        });
    }
    
    /**
     * Validate all data from event, interactive CLI or non interactive CLI
     * and prepare data
     */
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
        if (!_this.evt.stage || !_this.evt.region) {
          return BbPromise.reject(new JawsError('Missing stage or region'));
        }
      }

      // validate stage: make sure stage exists
      if (!_this.Jaws._projectJson.stages[_this.evt.stage] && _this.evt.stage != 'local') {
        return BbPromise.reject(new JawsError('Stage ' + _this.evt.stage + ' does not exist in your project', JawsError.errorCodes.UNKNOWN));
      }
      
      // skip the next validation if stage is 'local' & region is 'all'
      if (_this.evt.stage != 'local' && _this.evt.region != 'all') {
        // validate region: make sure region exists in stage
        if (!_this.Jaws._projectJson.stages[_this.evt.stage].some(function(r) {
              return r.region == _this.evt.region;
            })) {
          return BbPromise.reject(new JawsError('Region "' + _this.evt.region + '" does not exist in stage "' + _this.evt.stage + '"'));  
        }
      }

    }
    
    /**
     * list env vars based on the validated data
     */
    _listEnvVars() {
      let _this = this;
      let awsModsDir = path.join(_this.Jaws._projectRootPath, 'back', 'slss_modules');

      return JawsUtils.findAllAwsmJsons(awsModsDir)
        .then(awsmJsonPaths => {
          return [awsmJsonPaths, awsMisc.getEnvFiles(_this.Jaws, _this.evt.region, _this.evt.stage)];
        })
        .spread((awsmJsonPaths, envMapsByRegion) => {
          let envInBackMap = {};
          JawsCLI.log(`ENV vars for stage ${_this.evt.stage}:`);
          envMapsByRegion.forEach(mapForRegion => {
            JawsCLI.log('------------------------------');
            JawsCLI.log(mapForRegion.regionName);
            JawsCLI.log('------------------------------');
            console.log(chalk.bold(mapForRegion.raw + '') + '\n');
          });

          //first build up a list of all env vars awsm modules say they need
          awsmJsonPaths.forEach(ajp => {
            let awsmJson = require(ajp);
            if (awsmJson.envVars) {
              awsmJson.envVars.forEach(function(key) {
                let rel = path.relative(awsModsDir, ajp);
                if (envInBackMap[key]) {
                  envInBackMap[key].push(rel);
                } else {
                  envInBackMap[key] = [rel];
                }
              });
            }
          });

          let awsmKeys = Object.keys(envInBackMap);
          if (awsmKeys.length) {
            JawsCLI.log('awsm.json:lambda.envVars and regions where they are used (red means NOT defined in region):');
            awsmKeys.forEach(key => {
              let regionNamesColored = envMapsByRegion.map(rMap => {
                return (!rMap.vars[key]) ? chalk.white.bgRed(rMap.regionName) : rMap.regionName;
              });

              JawsCLI.log('------------------------------');
              JawsCLI.log(key);
              JawsCLI.log('------------------------------');

              JawsCLI.log(chalk.bold('aws mods using') + ': ' + envInBackMap[key].join(','));
              JawsCLI.log(chalk.bold('regions') + ': ' + regionNamesColored.join(',') + '\n');
            });
          }

          return envMapsByRegion;
        });
  }    
}

module.exports = EnvList;
