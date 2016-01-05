'use strict';

/**
 * Action: EnvList
 * - List env vars and their values based on the provided event
 *
 * Options:
 * - stage    (String) a stage that exists in the project
 * - region   (String) a region that is defined in the provided stage
 */

module.exports = function(SPlugin, serverlessPath) {
  const path     = require('path'),
      SError     = require(path.join(serverlessPath, 'ServerlessError')),
      SCli       = require(path.join(serverlessPath, 'utils/cli')),
      chalk      = require('chalk'),
      BbPromise  = require('bluebird'),
      awsMisc    = require(path.join(serverlessPath, 'utils/aws/Misc')),
      SUtils     = require(path.join(serverlessPath, 'utils'));

  /**
   * EnvList Class
   */

  class EnvList extends SPlugin {

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
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    envList(evt) {

      let _this    = this;
      _this.evt    = evt;

      // Get Meta instance
      this.meta    = new this.S.classes.Meta(this.S);
      this.project = new this.S.classes.Project(this.S);

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(function() {

            /**
             * Return EVT
             */

            return _this.evt;

          })
    }

    /**
     * Prompt stage and region
     */
    _prompt() {
      let _this = this;

      return _this.cliPromptSelectStage('Select a stage to list env vars from: ', _this.evt.options.stage, true)
          .then(stage => {
            _this.evt.options.stage = stage;
            BbPromise.resolve();
          })
          .then(function(){
              return _this.cliPromptSelectRegion('Select a region to list env vars from: ', true, true, _this.evt.options.region, _this.evt.options.stage)
                .then(region => {
                   _this.evt.options.region = region;
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
      if (!_this.S.config.interactive) {

        // Check Params
        if (!_this.evt.options.stage || !_this.evt.options.region) {
          return BbPromise.reject(new SError('Missing stage or region'));
        }
      }

      // Validate stage: make sure stage exists
      if (!_this.meta.data.private.stages[_this.evt.options.stage] && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Skip the next validation if stage is 'local' & region is 'all'
      if (_this.evt.options.stage != 'local' && _this.evt.options.region != 'all') {

        // Validate region: make sure region exists in stage
        if (!_this.meta.data.private.stages[_this.evt.options.stage].regions[_this.evt.options.region]) {
          return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
        }
      }

      return BbPromise.resolve(_this.project.getFunctions())
          .then(functions => {
            return [functions, awsMisc.getEnvFiles(_this.S, _this.evt.options.region, _this.evt.options.stage)];
          })
          .spread((functions, envMapsByRegion) => {

            let envInBackMap = {};
            SCli.log(`ENV vars for stage ${_this.evt.options.stage}:`);
            envMapsByRegion.forEach(mapForRegion => {
              SCli.log('------------------------------');
              SCli.log(mapForRegion.region);
              SCli.log('------------------------------');
              console.log(chalk.bold(mapForRegion.raw + '') + '\n');
            });

            // first build up a list of all env vars s-function say they need
            functions.forEach(func => {
              if (func.data.custom.envVars) {
                func.data.custom.envVars.forEach(function(key) {
                  if (envInBackMap[key]) {
                    envInBackMap[key].push(func.data.name);
                  } else {
                    envInBackMap[key] = [func.data.name];
                  }
                });
              }
            });

            let envKeys = Object.keys(envInBackMap);
            if (envKeys.length) {
              SCli.log('env vars in all s-function.json files and regions where they are used (red means NOT defined in region):');
              envKeys.forEach(key => {
                let regionNamesColored = envMapsByRegion.map(rMap => {
                  return (!rMap.vars[key]) ? chalk.white.bgRed(rMap.region) : rMap.region;
                });

                SCli.log('------------------------------');
                SCli.log(key);
                SCli.log('------------------------------');

                SCli.log(chalk.bold('used by functions') + ': ' + envInBackMap[key].join(','));
                SCli.log(chalk.bold('regions') + ': ' + regionNamesColored.join(',') + '\n');
              });
            }
            envMapsByRegion.map(r => {
                return {region: r.region, vars: r.vars}
              });

            _this.evt.data.variablesByRegion = envMapsByRegion;
          });
    }
  }

  return( EnvList );
};
