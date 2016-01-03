'use strict';

/**
 * Action: EnvGet
 * - Gets an env var value from bucket based on provided Event
 *
 * Event Properties:
 * - stage    (String) a stage that exists in the project
 * - region   (String) a region that is defined in the provided stage
 * - key      (String) the env var key you want to get from region bucket
 */

module.exports = function(SPlugin, serverlessPath) {
  const path = require('path'),
      SError  = require(path.join(serverlessPath, 'ServerlessError')),
      SCli    = require(path.join(serverlessPath, 'utils/cli')),
      chalk      = require('chalk'),
      BbPromise  = require('bluebird'),
      awsMisc    = require(path.join(serverlessPath, 'utils/aws/Misc'));

  /**
   * EnvGet Class
   */

  class EnvGet extends SPlugin {

    /**
     * Constructor
     */

    constructor(S, config) {
      super(S, config);
      this.options = {};
    }

    /**
     * Define your plugins name
     *
     * @returns {string}
     */
    static getName() {
      return 'serverless.core.' + EnvGet.name;
    }

    /**
     * @returns {Promise} upon completion of all registrations
     */

    registerActions() {
      this.S.addAction(this.envGet.bind(this), {
        handler:       'envGet',
        description:   `Get env var value for stage and region. Region can be 'all'
usage: serverless env get`,
        context:       'env',
        contextAction: 'get',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to get env var from'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to get env var from'
          },
          {
            option:      'key',
            shortcut:    'k',
            description: 'the key of the env var you want to get'
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
    envGet(options) {

      let _this = this;
      this.options = options || {};

      // If CLI, parse arguments
      if (this.S.cli && (!options || !options.subaction)) {
        this.options = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (this.S.cli.options.nonInteractive) this.S.config.interactive = false;
      }

      // Get Meta instance
      this.meta = new this.S.classes.Meta(this.S);

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._getEnvVar)
          .then(function() {
            return _this.options;
          });
    }

    /**
     * Prompt key, stage and region
     */
    _prompt() {
      let _this = this;

      return SCli.awsPromptInputEnvKey('Enter env var key to get its value: ', _this)
        .then(key => {
          _this.options.key = key;
          BbPromise.resolve();
        })
      .then(function(){
        return _this.cliPromptSelectStage('Select a stage to get env var from: ', _this.options.stage, true)
          .then(stage => {
            _this.options.stage = stage;
            BbPromise.resolve();
          })
      })
      .then(function(){
          return _this.cliPromptSelectRegion('Select a region to get env var from: ', true, true, _this.options.region, _this.options.stage)
            .then(region => {
              _this.options.region = region;
              BbPromise.resolve();
            });
      });

    }

    /**
     * Validate all data from event, interactive CLI or non interactive CLI
     * and prepare data
     */

    _validateAndPrepare(){
      let _this = this;

      // non interactive validation
      if (!_this.S.config.interactive) {
        // Check Params
        if (!_this.options.stage || !_this.options.region || !_this.options.key) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // validate stage: make sure stage exists
      if (!_this.meta.data.private.stages[_this.options.stage] && _this.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // skip the next validation if stage is 'local' & region is 'all'
      if (_this.options.stage != 'local' && _this.options.region != 'all') {

        // validate region: make sure region exists in stage
        if (!_this.meta.data.private.stages[_this.options.stage].regions[_this.options.region]) {
          return BbPromise.reject(new SError('Region "' + _this.options.region + '" does not exist in stage "' + _this.options.stage + '"'));
        }
      }
    }

    /**
     * get env var based on data validated
     */

    _getEnvVar(){
      let _this = this;

      return awsMisc.getEnvFiles(_this.S, _this.options.region, _this.options.stage)
          .then(envMapsByRegion => {
            let valByRegion = {};

            SCli.log(`Values for ${_this.options.key} in stage ${_this.options.stage} by region:`);
            envMapsByRegion.forEach(mapForRegion => {
              let value;
              if (mapForRegion.vars && mapForRegion.vars[_this.options.key]) {
                value = mapForRegion.vars[_this.options.key];
                valByRegion[mapForRegion.regionName] = value;
              } else {
                value = chalk.red('NOT SET');
              }

              console.log(chalk.underline.bold(mapForRegion.regionName) + `: ${value}`);
            });

            _this.options.valByRegion = valByRegion;

            return BbPromise.resolve(_this.options);
          });
    }
  }

  return( EnvGet );
};
