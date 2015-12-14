'use strict';

/**
 * Action: StageCreate
 * - Creates new stage, and new region in that stage for your project.
 * - Creates a new project S3 bucket for the new region and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Updates the project's s-project.json file with the new stage and region
 *
 * Event Properties:
 * - stage                (String) the name of the new stage
 * - region               (String) the name of the new region in the provided stage
 * - noExeCf:             (Boolean) Don't execute CloudFormation
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
 * StageCreate Class
 */

class StageCreate extends SPlugin {

  constructor(S, config) {
    super(S, config);
    this.evt = {};
  }

  static getName() {
    return 'serverless.core.' + StageCreate.name;
  }

  registerActions() {
    this.S.addAction(this.stageCreate.bind(this), {
      handler:       'stageCreate',
      description:   `Creates new stage for project
usage: serverless stage create`,
      context:       'stage',
      contextAction: 'create',
      options:       [
        {
          option:      'region',
          shortcut:    'r',
          description: 'AWS lambda supported region for your new stage.'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'new stage name.'
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

  stageCreate(evt) {

    let _this = this;

    if(evt) {
      _this.evt = evt;
      _this.S._interactive = false;
    }

    // If CLI, parse arguments
    if (_this.S.cli) {
      _this.evt = JSON.parse(JSON.stringify(_this.S.cli.options)); // Important: Clone objects, don't refer to them
      
      if (_this.S.cli.options.nonInteractive) {
        _this.S._interactive = false;
      }
    }
    
    return _this.S.validateProject()
      .bind(_this)
      .then(_this._prompt)
      .then(_this._validateAndPrepare)
      .then(_this._initAWS)
      .then(_this._updateCfTemplate)
      .then(_this._createRegionBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._updateProjectJson)
      .then(function() {
        SCli.log('Successfully created stage ' + _this.evt.stage + ' with region ' + _this.evt.region);
        return _this.evt;
      });
  }

  /**
   * Prompt stage and region
   */

  _prompt() {
    let _this = this;
    
    // Skip if non-interactive or stage is provided
    if (!_this.S._interactive || _this.evt.stage) return BbPromise.resolve();

    let prompts = {
      properties: {}
    };

    prompts.properties.stage = {
      description: 'Enter a new stage name for this project: '.yellow,
      required:    true,
      message:     'Stage must be letters and numbers only',
      conform:     function(stage) {
        return SUtils.isStageNameValid(stage);
      }
    };
    
    return _this.cliPromptInput(prompts, null)
      .then(function(answers) {
        _this.evt.stage = answers.stage.toLowerCase();
        BbPromise.resolve();
      })
      .then(function(){
        return _this.cliPromptSelectRegion('Select a region for your new stage: ', false, _this.evt.region, false)
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

    // non interactive validation
    if (!this.S._interactive) {

      // Check Params
      if (!this.evt.stage || !this.evt.region) {
        return BbPromise.reject(new SError('Missing stage or region'));
      }
    }
    
    // validate stage
    if (!SUtils.isStageNameValid(this.evt.stage)) {
      return BbPromise.reject(new SError('Invalid stage name. Stage must be letters and numbers only.', SError.errorCodes.UNKNOWN));
    }

    // validate stage: Ensure stage isn't "local"
    this.evt.stage = this.evt.stage.toLowerCase().replace(/\W+/g, '').substring(0, 15);
    if (this.evt.stage == 'local') {
      return BbPromise.reject(new SError('Stage ' + this.evt.stage + ' is reserved'));
    }
    
    // validate stage: Ensure stage doesn't already exist
    if (this.S._projectJson.stages[this.evt.stage]) {
      return BbPromise.reject(new SError('Stage ' + this.evt.stage + ' already exists', SError.errorCodes.UNKNOWN));
    }
    
    // validate region
    if (awsMisc.validLambdaRegions.indexOf(this.evt.region) == -1) {
      return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.evt.region, SError.errorCodes.UNKNOWN));
    }

    // Status
    SCli.log('Creating stage and region: ' + this.evt.stage + '/' + this.evt.region);

    return BbPromise.resolve();
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

    this.CF       = require('../utils/aws/CloudFormation')(awsConfig);
    this.Lambda   = require('../utils/aws/Lambda')(awsConfig);
    this.S3       = require('../utils/aws/S3')(awsConfig);
  }
  
  /**
   * Update CF Template
   * - Add a stage to an existing project resources cloudformation template
   */

  _updateCfTemplate() {

    let projResoucesCfPath  = path.join(this.S._projectRootPath, 'cloudformation', 'resources-cf.json'),
        cfTemplate          = SUtils.readAndParseJsonSync(projResoucesCfPath);

    // Add new stage to AllowedValues
    cfTemplate.Parameters.aaStage.AllowedValues.push(this.evt.stage);
    cfTemplate.Parameters.aaDataModelStage.AllowedValues.push(this.evt.stage);

    // Check if project name is in AllowedValues
    if (cfTemplate.Parameters.aaProjectName.AllowedValues.indexOf(this.S._projectJson.name) == -1) {
      cfTemplate.Parameters.aaProjectName.AllowedValues.push(this.S._projectJson.name);
    }

    // Write it
    return SUtils.writeFile(
        projResoucesCfPath,
        JSON.stringify(cfTemplate, null, 2)
    );
  }

  /**
   * Create Project Bucket
   * - if it does not exist
   */

  _createRegionBucket() {
    this.evt.regionBucket = SUtils.generateRegionBucketName(this.evt.region, this.S._projectJson.domain);
    SCli.log('Creating a region bucket on S3: ' + this.evt.regionBucket + '...');
    return this.S3.sCreateBucket(this.evt.regionBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in regional project bucket
   */

  _putEnvFile() {
    let stage = this.evt.stage;

    let envFileContents = `SERVERLESS_STAGE=${stage}
SERVERLESS_DATA_MODEL_STAGE=${stage}`;

    return this.S3.sPutEnvFile(
        this.evt.regionBucket,
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
        this.evt.regionBucket,
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
      SCli.log('After creating CF stack, remember to put the IAM role outputs and regionBucket in your project s-project.json in the correct stage/region.');

      return BbPromise.resolve();
    }

    SCli.log('Creating CloudFormation Stack for your new stage (~5 mins)...');
    _this._spinner = SCli.spinner();
    _this._spinner.start();

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

    let _this     = this,
        regionObj = {
          region:               _this.evt.region,
          iamRoleArnLambda:     '',
          regionBucket:           _this.evt.regionBucket,
        };

    if (cfStackData) {
      for (let i = 0; i < cfStackData.Outputs.length; i++) {
        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          regionObj.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
          _this.evt.iamRoleLambdaArn = cfStackData.Outputs[i].OutputValue;
        }
      }

      // Save StackName to Evt
      _this.evt.stageCfStack = cfStackData.StackName;
    }

    if (_this.S._projectJson.stages[_this.evt.stage]) {
      _this.S._projectJson.stages[_this.evt.stage].push(regionObj);
    } else {
      _this.S._projectJson.stages[_this.evt.stage] = [regionObj];
    }

    return SUtils.writeFile(
        path.join(_this.S._projectRootPath, 's-project.json'),
        JSON.stringify(_this.S._projectJson, null, 2)
    );
  }
}

module.exports = StageCreate;
