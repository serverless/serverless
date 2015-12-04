'use strict';

/**
 * Action: EnvSet
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
      _this.evt = _this.S.cli.options;
      
      if (_this.S.cli.options.nonInteractive) {
        _this.S._interactive = false;
      }
    }
    
    return _this.S.validateProject()
      .bind(_this)
      .then(_this._promptKeyVal)
      .then(_this._promptStage)
      .then(_this._promptRegion)
      .then(_this._validateAndPrepare)
      .then(_this._setEnvVar)
      .then(function() {
        SCli.log('Successfully set env var: ' + _this.evt.key);
      });
  }
  
  /**
   * Prompt key & value if they're missing
   */
  _promptKeyVal(){
    let _this = this,
      overrides = {};

    if (!_this.S._interactive) return BbPromise.resolve();
    
    ['key', 'value'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this['evt'][memberVarKey];
      });

    let prompts = {
      properties: {
        key:              {
          description: 'Enter the key for the env var you want to set: '.yellow,
          message:     'env var key is required.',
          required:    true,
        },
        value:            {
          description: 'Enter the value for the env var you want to set: '.yellow,
          message:     'env var value is required',
          required:    true,
        },
      }
    };
    
    return _this.promptInput(prompts, overrides)
      .then(function(answers) {
        _this.evt.key = answers.key;
        _this.evt.value = answers.value;
      });
  }
  
  /**
   * Prompt stage if it's missing
   */
  _promptStage(){
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

    return SCli.select('Which stage are you setting the env var in: ', choices, false)
      .then(function(results) {
        _this.evt.stage = results[0].value;
      });
  }
  
  /**
   * Prompt region if it's missing
   */
  _promptRegion(){
    let _this = this;

    // skip region prompt if selected stage is 'local'
    if (_this.evt.stage === 'local') {
      _this.evt.region = 'local';
      return BbPromise.resolve();
    }

    if (!_this.S._interactive || _this.evt.region) return BbPromise.resolve();
    
    // TODO: list only regions defined in the provided stage
    //       this assumes that the provided stage is valid, we'll have to validate before getting here
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

    return _this.selectInput('Select a region for your new env var: ', choices, false)
      .then(results => {
        _this.evt.region = results[0].value;
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

      // Check API Keys
      if (!_this.S._awsProfile) {
        if (!_this.S._awsAdminKeyId || !_this.S._awsAdminSecretKey) {
          return BbPromise.reject(new SError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
        }
      }
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
            putEnvQ.push(SUtils.writeFile(path.join(this.S._projectRootPath, '.env'), contents));
          } else {
            let config = {
              profile: _this._awsProfile, 
              region : mapForRegion.regionName
            };

            let S3  = require('../utils/aws/S3')(config);
            let bucket = SUtils.getProjRegionConfigForStage(_this.S._projectJson, _this.evt.stage, mapForRegion.regionName).regionBucket;
            putEnvQ.push(S3.sPutEnvFile(bucket, _this.S._projectJson.name, _this.evt.stage, contents));
          }
        });

        return BbPromise.all(putEnvQ);
      });
  }
}

module.exports = EnvSet;
