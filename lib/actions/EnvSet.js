'use strict';

/**
 * Action: EnvSet
 * - Sets an environment variable based on the provide event
 *
 * Event Properties:
 * - stage    (String) a stage that exists in the project
 * - region   (String) a region that is defined in the provided stage
 * - key      (String) the env var key you want to set a value to
 * - value    (String) the env var value you want to set to the provided key
 */

const SPlugin = require('../ServerlessPlugin'),
      SError  = require('../ServerlessError'),
      SCli    = require('../utils/cli'),
      path       = require('path'),
      BbPromise  = require('bluebird'),
      awsMisc    = require('../utils/aws/Misc'),
      SUtils  = require('../utils');

/**
 * EnvSet Class
 */

class EnvSet extends SPlugin {

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
    return 'serverless.core.' + EnvSet.name;
  }

  /**
   * Register Actions
   */

  registerActions() {
    this.S.addAction(this.envSet.bind(this), {
      handler:       'envSet',
      description:   `set var value for stage and region. Region can be 'all'
usage: serverless env set`,
      context:       'env',
      contextAction: 'set',
      options:       [
        {
          option:      'region',
          shortcut:    'r',
          description: 'region you want to set env var in'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'stage you want to set env var in'
        },
        {
          option:      'key',
          shortcut:    'k',
          description: 'the key of the env var you want to set'
        },
        {
          option:      'value',
          shortcut:    'v',
          description: 'the value of the env var you want to set'
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
  envSet(evt) {
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
      .then(_this._setEnvVar)
      .then(function() {
        SCli.log('Successfully set env var: ' + _this.evt.key);
        return BbPromise.resolve(_this.evt);
      });
  }


  /**
   * Prompt key, value, stage and region
   */
  _prompt() {
    let _this = this;

    return SCli.awsPromptInputEnvKey('Enter env var key to set a value to: ', _this)
      .then(key => {
        _this.evt.key = key;
        BbPromise.resolve();
      })
      .then(function(){
        return SCli.awsPromptInputEnvValue('Enter env var value to set to the provided key: ', _this)
          .then(value => {
            _this.evt.value = value;
            BbPromise.resolve();
        })
      })
      .then(function(){
        return _this.cliPromptSelectStage('Select a stage to set your env var in: ', _this.evt.stage, true)
          .then(stage => {
            _this.evt.stage = stage;
            BbPromise.resolve();
          })
      })
      .then(function(){
        return _this.cliPromptSelectRegion('Select a region to set env var in: ', true, _this.evt.region, _this.evt.stage)
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
      if (!_this.evt.stage || !_this.evt.region || !_this.evt.key || !_this.evt.value) {
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
   * set env var based on data validated
   */
  _setEnvVar(){
    let _this = this;

    return awsMisc.getEnvFiles(this.S, _this.evt.region,  _this.evt.stage)
      .then(envMapsByRegion => {
        let putEnvQ = [];

        envMapsByRegion.forEach(mapForRegion => {
          if (!mapForRegion.vars) { //someone could have del the .env file..
            mapForRegion.vars = {};
          }

          mapForRegion.vars[_this.evt.key] = _this.evt.value;

          let contents = '';
          Object.keys(mapForRegion.vars).forEach(newKey => {
            contents += [newKey, mapForRegion.vars[newKey]].join('=') + '\n';
          });

          if (_this.evt.stage == 'local') {
            putEnvQ.push(SUtils.writeFile(path.join(this.S._projectRootPath, 'back', '.env'), contents));
          } else {
            
            let awsConfig = {
              region:          mapForRegion.regionName,
              accessKeyId:     _this.S._awsAdminKeyId,
              secretAccessKey: _this.S._awsAdminSecretKey,
            };
            
            let S3  = require('../utils/aws/S3')(awsConfig);
            let bucket = SUtils.getRegionConfig(_this.S._projectJson, _this.evt.stage, mapForRegion.regionName).regionBucket;
            putEnvQ.push(S3.sPutEnvFile(bucket, _this.S._projectJson.name, _this.evt.stage, contents));
          }
        });

        return BbPromise.all(putEnvQ);
      });
  }
}

module.exports = EnvSet;
