'use strict';

/**
 * Action: EnvList
 * - List env vars and their values based on the provided event
 *
 * Event Properties:
 * - stage    (String) a stage that exists in the project
 * - region   (String) a region that is defined in the provided stage
 */

const SPlugin = require('../ServerlessPlugin'),
      SError  = require('../ServerlessError'),
      SCli    = require('../utils/cli'),
      path       = require('path'),
      chalk      = require('chalk'),
      BbPromise  = require('bluebird'),
      awsMisc    = require('../utils/aws/Misc'),
      SUtils  = require('../utils');

/**
 * EnvList Class
 */

class EnvList extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
    this.evt = {};
  }

  /**
   * Define your plugins name
   */

  static getName() {
    return 'serverless.core.' + EnvList.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.S.addAction(this.envList.bind(this), {
      handler:       'envList',
      description:   `List env vars for stage and region.  Region can be 'all'
Usage: serverless env list`,
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
      _this.S._interactive = false;
    }

    // If CLI, parse arguments
    if (_this.S.cli) {
      _this.evt = _this.S.cli.options;
      
      if (_this.S.cli.options.nonInteractive) {
        _this.S._interactive = false;
      }
    }

    return _this.S.validateProject()
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
      let stages = Object.keys(_this.S._projectJson.stages);


      // Skip if non-interactive
      if (!_this.S._interactive || _this.evt.stage) return BbPromise.resolve();

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

      return SCli.select('Which stage are you listing env vars for: ', choices, false)
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

      if (!_this.S._interactive || _this.evt.region) return BbPromise.resolve();
      
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

      return _this.cliPromptSelect('Select a region for your stage: ', choices, false)
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
      if (!_this.S._interactive) {

        // Check API Keys
        if (!_this.S._awsProfile) {
          if (!_this.S._awsAdminKeyId || !_this.S._awsAdminSecretKey) {
            return BbPromise.reject(new SError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
          }
        }
        // Check Params
        if (!_this.evt.stage || !_this.evt.region) {
          return BbPromise.reject(new SError('Missing stage or region'));
        }
      }

      // validate stage: make sure stage exists
      if (!_this.S._projectJson.stages[_this.evt.stage] && _this.evt.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }
      
      // skip the next validation if stage is 'local' & region is 'all'
      if (_this.evt.stage != 'local' && _this.evt.region != 'all') {
        // validate region: make sure region exists in stage
        if (!_this.S._projectJson.stages[_this.evt.stage].some(function(r) {
              return r.region == _this.evt.region;
            })) {
          return BbPromise.reject(new SError('Region "' + _this.evt.region + '" does not exist in stage "' + _this.evt.stage + '"'));
        }
      }

    }
    
    /**
     * List ENV Vars
     * - list env vars based on the validated data
     */

    _listEnvVars() {

      let _this = this;
      let modulesDir = path.join(_this.S._projectRootPath, 'back', 'modules');

      return SUtils.getModules(modulesDir)
        .then(moduleJsonPaths => {
          return [moduleJsonPaths, awsMisc.getEnvFiles(_this.S, _this.evt.region, _this.evt.stage)];
        })
        .spread((moduleJsonPaths, envMapsByRegion) => {

          let envInBackMap = {};
          SCli.log(`ENV vars for stage ${_this.evt.stage}:`);
          envMapsByRegion.forEach(mapForRegion => {
            SCli.log('------------------------------');
            SCli.log(mapForRegion.regionName);
            SCli.log('------------------------------');
            console.log(chalk.bold(mapForRegion.raw + '') + '\n');
          });

          // first build up a list of all env vars s-function say they need
          moduleJsonPaths.forEach(ajp => {
            let moduleJson = require(ajp);
            if (moduleJson.envVars) {
              moduleJson.envVars.forEach(function(key) {
                let rel = path.relative(modulesDir, ajp);
                if (envInBackMap[key]) {
                  envInBackMap[key].push(rel);
                } else {
                  envInBackMap[key] = [rel];
                }
              });
            }
          });

          let moduleKeys = Object.keys(envInBackMap);
          if (moduleKeys.length) {
            SCli.log('s-function.json: lambda.envVars and regions where they are used (red means NOT defined in region):');
            moduleKeys.forEach(key => {
              let regionNamesColored = envMapsByRegion.map(rMap => {
                return (!rMap.vars[key]) ? chalk.white.bgRed(rMap.regionName) : rMap.regionName;
              });

              SCli.log('------------------------------');
              SCli.log(key);
              SCli.log('------------------------------');

              SCli.log(chalk.bold('aws mods using') + ': ' + envInBackMap[key].join(','));
              SCli.log(chalk.bold('regions') + ': ' + regionNamesColored.join(',') + '\n');
            });
          }

          _this.evt.envMapsByRegion = envMapsByRegion;

          return BbPromise.resolve(_this.evt);
        });
  }    
}

module.exports = EnvList;
