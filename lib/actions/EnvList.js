'use strict';

/**
 * Action: EnvList
 * - List env vars and their values based on the provided event
 *
 * Event Properties:
 * - stage    (String) a stage that exists in the project
 * - region   (String) a region that is defined in the provided stage
 */

module.exports = function(SPlugin, serverlessPath) {
  const path = require('path'),
      SError  = require(path.join(serverlessPath, 'ServerlessError')),
      SCli    = require(path.join(serverlessPath, 'utils/cli')),
      chalk      = require('chalk'),
      BbPromise  = require('bluebird'),
      awsMisc    = require(path.join(serverlessPath, 'utils/aws/Misc')),
      SUtils  = require(path.join(serverlessPath, 'utils'));

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

        _this.evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

        if (_this.S.cli.options.nonInteractive) {
          _this.S._interactive = false;
        }
      }

      return _this.S.validateProject()
          .bind(_this)
          .then(_this._prompt)
          .then(_this._validateAndPrepare)
          .then(function(evt) {
            return evt;
          })
    }

    /**
     * Prompt stage and region
     */
    _prompt() {
      let _this = this;

      return _this.cliPromptSelectStage('Select a stage to list env vars from: ', _this.evt.stage, true)
          .then(stage => {
            _this.evt.stage = stage;
            BbPromise.resolve();
          })
          .then(function(){
              return _this.cliPromptSelectRegion('Select a region to list env vars from: ', true, true, _this.evt.region, _this.evt.stage)
                .then(region => {
                   _this.evt.region = region;
                   BbPromise.resolve();
                });
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

      return SUtils.getFunctions(_this.S._projectRootPath, null)
          .then(functions => {
            return [functions, awsMisc.getEnvFiles(_this.S, _this.evt.region, _this.evt.stage)];
          })
          .spread((functions, envMapsByRegion) => {

            let envInBackMap = {};
            SCli.log(`ENV vars for stage ${_this.evt.stage}:`);
            envMapsByRegion.forEach(mapForRegion => {
              SCli.log('------------------------------');
              SCli.log(mapForRegion.regionName);
              SCli.log('------------------------------');
              console.log(chalk.bold(mapForRegion.raw + '') + '\n');
            });

            // first build up a list of all env vars s-function say they need
            functions.forEach(func => {
              if (func.custom.envVars) {
                func.custom.envVars.forEach(function(key) {
                  if (envInBackMap[key]) {
                    envInBackMap[key].push(func.name);
                  } else {
                    envInBackMap[key] = [func.name];
                  }
                });
              }
            });

            let envKeys = Object.keys(envInBackMap);
            if (envKeys.length) {
              SCli.log('env vars in all s-function.json files and regions where they are used (red means NOT defined in region):');
              envKeys.forEach(key => {
                let regionNamesColored = envMapsByRegion.map(rMap => {
                  return (!rMap.vars[key]) ? chalk.white.bgRed(rMap.regionName) : rMap.regionName;
                });

                SCli.log('------------------------------');
                SCli.log(key);
                SCli.log('------------------------------');

                SCli.log(chalk.bold('used by functions') + ': ' + envInBackMap[key].join(','));
                SCli.log(chalk.bold('regions') + ': ' + regionNamesColored.join(',') + '\n');
              });
            }
            _this.evt.envMapsByRegion = envMapsByRegion.map(r => {
                return {regionName: r.regionName, vars: r.vars}
              });

            return BbPromise.resolve(_this.evt);
          });
    }
  }

  return( EnvList );
};
