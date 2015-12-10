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

const SPlugin = require('../ServerlessPlugin'),
    SError  = require('../ServerlessError'),
    SCli    = require('../utils/cli'),
    chalk      = require('chalk'),
    BbPromise  = require('bluebird'),
    SUtils  = require('../utils'),
    awsMisc    = require('../utils/aws/Misc');

/**
 * EnvGet Class
 */

class EnvGet extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
    this.evt = {};
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
  envGet(evt) {
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
        .then(_this._prompt)
        .then(_this._validateAndPrepare)
        .then(_this._getEnvVar)
        .then(function() {
          return _this.evt;
        });
  }

  /**
   * Prompt key, stage and region
   */
  _prompt() {
    let _this = this;

    return _this.cliPromptInputEnvKey('Enter env var key to get its value: ', _this.evt.key)
      .then(key => {
        _this.evt.key = key;
        BbPromise.resolve();
      })
    .then(function(){
      return _this.cliPromptSelectStage('Select a stage to get env var from: ', _this.evt.stage, true)
        .then(stage => {
          _this.evt.stage = stage;
          BbPromise.resolve();
        })
    })
    .then(function(){
        return _this.cliPromptSelectRegion('Select a region to get env var from: ', true, _this.evt.region, _this.evt.stage)
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

  _validateAndPrepare(){
    let _this = this;

    // non interactive validation
    if (!_this.S._interactive) {

      // Check Params
      if (!_this.evt.stage || !_this.evt.region || !_this.evt.key) {
        return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
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
   * get env var based on data validated
   */

  _getEnvVar(){
    let _this = this;

    return awsMisc.getEnvFiles(_this.S, _this.evt.region, _this.evt.stage)
        .then(envMapsByRegion => {
          let valByRegion = {};

          SCli.log(`Values for ${_this.evt.key} in stage ${_this.evt.stage} by region:`);
          envMapsByRegion.forEach(mapForRegion => {
            let value;
            if (mapForRegion.vars && mapForRegion.vars[_this.evt.key]) {
              value = mapForRegion.vars[_this.evt.key];
              valByRegion[mapForRegion.regionName] = value;
            } else {
              value = chalk.red('NOT SET');
            }

            console.log(chalk.underline.bold(mapForRegion.regionName) + `: ${value}`);
          });

          _this.evt.valByRegion = valByRegion;

          return BbPromise.resolve(_this.evt);
        });
  }
}

module.exports = EnvGet;
