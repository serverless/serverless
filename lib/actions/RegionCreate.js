'use strict';

/**
 * Action: RegionCreate
 */

const SPlugin = require('../ServerlessPlugin'),
    SError  = require('../ServerlessError'),
    SCli    = require('../utils/cli'),
    path       = require('path'),
    os         = require('os'),
    fs         = require('fs'),
    BbPromise  = require('bluebird'),
    awsMisc    = require('../utils/aws/Misc'),
    SUtils  = require('../utils');

BbPromise.promisifyAll(fs);

/**
 * RegionCreate Class
 */

class RegionCreate extends SPlugin {

  constructor(S, config) {
    super(S, config);
    this.evt = {};
  }

  static getName() {
    return 'serverless.core.' + RegionCreate.name;
  }

  registerActions() {
    this.S.addAction(this.regionCreate.bind(this), {
      handler:       'regionCreate',
      description:   `Creates new region for a stage in a project
usage: serverless region create`,

      context:       'region',
      contextAction: 'create',
      options:       [
        {
          option:      'region',
          shortcut:    'r',
          description: 'AWS lambda supported region for a stage.'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'The stage your want to create a region for.'
        },
        {
          option:      'nonInteractive',
          shortcut:    'ni',
          description: 'Optional - Turn off CLI interactivity if true. Default: false.'
        },
        {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false.'
        },
      ],
    });
    return BbPromise.resolve();
  }

  /**
   * Action
   */
  regionCreate(evt) {

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
      .then(_this._initAWS)
      .then(_this._createProjectBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._updateProjectJson)
      .then(function() {
        SCli.log('Successfully created region ' + _this.evt.region + ' within stage ' + _this.evt.stage);
      });
  }

  /**
   * Prompt stage if it's missing
   * @returns {Promise}
   * @private
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

    // Create Choices
    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key:   (i + 1) + ') ',
        value: stages[i],
        label: stages[i],
      });
    }

    return SCli.select('Which stage are you creating a region for: ', choices, false)
      .then(function(results) {
        _this.evt.stage = results[0].value;
      });
  }
  
  /**
   * Prompt region if it's missing
   * @returns {Promise}
   * @private
   */
  _promptRegion() {
    let _this = this;

    if (!_this.S._interactive || _this.evt.region) return BbPromise.resolve();
    
    let choices = awsMisc.validLambdaRegions.map(r => {
      return {
        key:   '',
        value: r,
        label: r,
      };
    });

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
    if (!_this.S._projectJson.stages[_this.evt.stage]) {
      return BbPromise.reject(new SError('Stage ' + _this.evt.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
    }
    
    // validate region: make sure Lambda is supported in that region
    if (awsMisc.validLambdaRegions.indexOf(_this.evt.region) == -1) {
      return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.evt.region, SError.errorCodes.UNKNOWN));
    }
    
    // validate region: make sure region is not already defined
    if (_this.S._projectJson.stages[_this.evt.stage].some(function(r) {
          return r.region == _this.evt.region;
        })) {
      return BbPromise.reject(new SError('Region "' + _this.evt.region + '" is already defined in the stage "' + _this.evt.stage + '"'));
    }
  }
  
  /**
   * Initialize needed AWS classes
   * @returns {Promise}
   * @private
   */
  _initAWS() {
    
    let awsConfig = {
      region:          this.evt.region,
      accessKeyId:     this.S._awsAdminKeyId,
      secretAccessKey: this.S._awsAdminSecretKey,
    };

    this.CF  = require('../utils/aws/CloudFormation')(awsConfig);
    this.Lambda  = require('../utils/aws/Lambda')(awsConfig);
    this.S3  = require('../utils/aws/S3')(awsConfig);
  }
  

  /**
   * Create Project Bucket
   * - If it does not exist
   */

  _createProjectBucket() {  
    this.evt.projectBucket = SUtils.generateRegionBucketName(this.evt.region, this.S._projectJson.domain);
    SCli.log('Creating a region bucket on S3: ' + this.evt.projectBucket + '...');
    return this.S3.sCreateBucket(this.evt.projectBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in Serverless stage/region bucket
   */

  _putEnvFile() {
    let stage = this.evt.stage;

    let envFileContents = `SERVERLESS_STAGE=${stage}
SERVERLESS_DATA_MODEL_STAGE=${stage}`;

    return this.S3.sPutEnvFile(
        this.evt.projectBucket,
        this.S._projectJson.name,
        this.evt.stage,
        envFileContents);
  }

  /**
   * Put CF File
   */

  _putCfFile() {
    return this.CF.sPutCfFile(
        this.S._projectRootPath,
        this.evt.projectBucket,
        this.S._projectJson.name,
        this.evt.stage,
        'resources');
  }

  /**
   * Create CloudFormation Stack
   */

  _createCfStack(cfTemplateUrl) {
    let _this = this;
    
    if (_this.evt.noExeCf) {
      let stackName = _this.CF.sGetResourcesStackName(_this.evt.stage, _this.S._projectJson.name);

      SCli.log(`Remember to run CloudFormation manually to create stack with name: ${stackName}`);
      SCli.log('After creating CF stack, remember to put the IAM role outputs and serverlessBucket in your project s-project.json in the correct stage/region.');

      return BbPromise.resolve();
    }

    SCli.log('Creating CloudFormation Stack for your new region (~5 mins)...');
    this._spinner = SCli.spinner();
    this._spinner.start();

    // Create CF stack
    return _this.CF.sCreateResourcesStack(
        _this.S._projectRootPath,
        _this.S._projectJson.name,
        _this.evt.stage,
        _this.S._projectJson.domain,
        '',
        cfTemplateUrl
        )
        .then(cfData => {
          return _this.CF.sMonitorCf(cfData, 'create')
              .then(cfStackData => {
                _this._spinner.stop(true);
                return cfStackData;
              });
        });
  }

  /**
   * Update Project JSON
   */

  _updateProjectJson(cfStackData) {
    let _this     = this;
    let regionObj = {
          region:               _this.evt.region,
          iamRoleArnLambda:     '',
          regionBucket:           _this.evt.projectBucket,
        };

    if (cfStackData) {
      for (let i = 0; i < cfStackData.Outputs.length; i++) {
        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          regionObj.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
        }
      }
    }
    
    _this.S._projectJson.stages[_this.evt.stage].push(regionObj);

    return SUtils.writeFile(
        path.join(_this.S._projectRootPath, 's-project.json'),
        JSON.stringify(_this.S._projectJson, null, 2)
    );
  }
}

module.exports = RegionCreate;
