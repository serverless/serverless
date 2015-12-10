'use strict';

/**
 * Action: ResourcesDeploy
 * - Deploys/Updates the cloudformation/resources-cf.json template to AWS
 * 
 * Event Properties:
 * stage     (String) the name of the stage you want to deploy resources to. Must exist in project.
 * region    (String) the name of the region you want to deploy resources to. Must exist in provided stage.
 */

const SPlugin = require('../ServerlessPlugin'),
      SError  = require('../ServerlessError'),
      SCli    = require('../utils/cli'),
      BbPromise  = require('bluebird'),
      awsMisc    = require('../utils/aws/Misc'),
      SUtils  = require('../utils/index');

class ResourcesDeploy extends SPlugin {

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
    return 'serverless.core.' + ResourcesDeploy.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.S.addAction(this.resourcesDeploy.bind(this), {
      handler:       'resourcesDeploy',
      description:   `Provision AWS resources (resources-cf.json).
usage: serverless resources deploy`,
      context:       'resources',
      contextAction: 'deploy',
      options:       [
        {
          option:      'region',
          shortcut:    'r',
          description: 'region you want to deploy to'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'stage you want to deploy to'
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
  resourcesDeploy(evt) {
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


    return this.S.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(_this._promptRegion)
      .then(_this._validateAndPrepare)
      .then(_this._updateResources)
      .then(() => {
        _this._spinner.stop(true);
        SCli.log('Resource Deployer:  Successfully deployed ' + _this.evt.stage + ' resources to ' + _this.evt.region.region);
        return _this.evt;
      });
  }
  
  /**
   * Prompt Stage
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

    // Create Choices
    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key:   (i + 1) + ') ',
        value: stages[i],
        label: stages[i],
      });
    }

    return SCli.select('Which stage are you deploying to: ', choices, false)
      .then(function(results) {
        _this.evt.stage = results[0].value;
      });
  }
  
  /**
   * Prompt Region
   */

  _promptRegion() {

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

    return _this.cliPromptSelect('Which region are you deploying to: ', choices, false)
      .then(results => {
        _this.evt.region = results[0].value;
      });
  }
  
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
      if (!_this.evt.stage || !_this.evt.region) {
        return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
      }
    }

    // validate stage: make sure stage exists
    if (!_this.S._projectJson.stages[_this.evt.stage] && _this.evt.stage != 'local') {
      return BbPromise.reject(new SError('Stage ' + _this.evt.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
    }

    // validate region: make sure region exists in stage
    if (!_this.S._projectJson.stages[_this.evt.stage].some(function(r) {
          return r.region == _this.evt.region;
        })) {
      return BbPromise.reject(new SError('Region "' + _this.evt.region + '" does not exist in stage "' + _this.evt.stage + '"'));
    }

    // Get full region config
    _this.evt.region = SUtils.getRegionConfig(_this.S._projectJson, _this.evt.stage, _this.evt.region);
  }
  
  _updateResources(){
    let _this = this;
    
    SCli.log('Deploying resources to stage  "'
      + _this.evt.stage
      + '" and region "'
      + _this.evt.region.region
      + '" via Cloudformation.  This could take a while depending on how many resources you are updating...');
    // Start spinner
    _this._spinner = SCli.spinner();
    _this._spinner.start();

    let awsConfig = {
      region:          _this.evt.region.region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };
    _this.CF  = require('../utils/aws/CloudFormation')(awsConfig);
    
    return _this.CF.sUpdateResourcesStack(
      _this.S,
      _this.evt.stage,
      _this.evt.region.region)
      .then(cfData => {
        return _this.CF.sMonitorCf(cfData, 'update');
      });
  }
}

module.exports = ResourcesDeploy;
