'use strict';

/**
 * Action: StageCreate
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError  = require('../../jaws-error'),
    JawsCLI    = require('../../utils/cli'),
    path       = require('path'),
    os         = require('os'),
    fs         = require('fs'),
    BbPromise  = require('bluebird'),
    awsMisc    = require('../../utils/aws/Misc'),
    JawsUtils  = require('../../utils');

BbPromise.promisifyAll(fs);

/**
 * StageCreate Class
 */

class StageCreate extends JawsPlugin {

  constructor(Jaws, config) {
    super(Jaws, config);
    this.evt = {};
  }

  static getName() {
    return 'jaws.core.' + StageCreate.name;
  }

  registerActions() {
    this.Jaws.addAction(this.stageCreate.bind(this), {
      handler:       'stageCreate',
      description:   `Creates new stage for project
usage: jaws stage create`,
      context:       'stage',
      contextAction: 'create',
      options:       [
        {
          option:      'region',
          shortcut:    'r',
          description: 'AWS lambda supported region for your new stage'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'new stage name'
        },
        {
          option:      'nonInteractive',
          shortcut:    'i',
          description: 'Optional - Turn off CLI interactivity if true. Default: false'
        },
        {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false'
        },
      ],
    });

    return BbPromise.resolve();
  }

  /**
   * Stage Create
   */

  stageCreate(evt) {

    let _this = this;

    if(evt) {
      _this.evt = evt;
      _this.Jaws._interactive = false;
    }

    // If CLI, parse arguments
    if (_this.Jaws.cli) {
      _this.evt = _this.Jaws.cli.options;
      
      if (_this.Jaws.cli.options.nonInteractive) {
        _this.Jaws._interactive = false;
      }
    }
    
    return _this.Jaws.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(_this._promptRegion)
      .then(_this._validateAndPrepare)
      .then(_this._initAWS)
      .then(_this._updateCfTemplate)
      .then(_this._createProjectBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._updateProjectJson)
      .then(function() {
        JawsCLI.log('Successfully created stage ' + _this.evt.stage + ' w/ region ' + _this.evt.region);
      });
  }

  
  /**
   * Prompt stage if it's missing
   * @returns {Promise}
   * @private
   */
  _promptStage() {
    let _this = this;
    
    // Skip if non-interactive or stage is provided
    if (!_this.Jaws._interactive || _this.evt.stage) return BbPromise.resolve();

    let prompts = {
      properties: {},
    };

    prompts.properties.stage = {
      description: 'Enter a new stage name for this project: '.yellow,
      required:    true,
      default:     'dev',
      message:     'Stage must be letters and numbers only',
      conform:     function(stage) {
        return JawsUtils.isStageNameValid(stage);
      },
    };
    
    return this.promptInput(prompts, null)
      .then(function(answers) {
        _this.evt.stage = answers.stage.toLowerCase();
      })
  }

  /**
   * Prompt region if it's missing
   * @returns {Promise}
   * @private
   */
  _promptRegion() {
    let _this = this;

    if (!_this.Jaws._interactive || _this.evt.region) return BbPromise.resolve();
    
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

    // non interactive validation
    if (!this.Jaws._interactive) {

      // Check API Keys
      if (!this.Jaws._awsProfile) {
        if (!this.Jaws._awsAdminKeyId || !this.Jaws._awsAdminSecretKey) {
          return BbPromise.reject(new JawsError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
        }
      }
      // Check Params
      if (!this.evt.stage || !this.evt.region) {
        return BbPromise.reject(new JawsError('Missing stage or region'));
      }
    }
    
    // validate stage
    if (!JawsUtils.isStageNameValid(this.evt.stage)) {
      return BbPromise.reject(new JawsError('Invalid stage name. Stage must be letters and numbers only.', JawsError.errorCodes.UNKNOWN));
    }

    // validate stage: Ensure stage isn't "local"
    this.evt.stage = this.evt.stage.toLowerCase().replace(/\W+/g, '').substring(0, 15);
    if (this.evt.stage == 'local') {
      return BbPromise.reject(new JawsError('Stage ' + this.evt.stage + ' is reserved'));
    }
    
    // validate stage: Ensure stage doesn't already exist
    if (this.Jaws._projectJson.stages[this.evt.stage]) {
      return BbPromise.reject(new JawsError('Stage ' + this.evt.stage + ' already exists', JawsError.errorCodes.UNKNOWN));
    }
    
    // validate region
    if (awsMisc.validLambdaRegions.indexOf(this.evt.region) == -1) {
      return BbPromise.reject(new JawsError('Invalid region. Lambda not supported in ' + this.evt.region, JawsError.errorCodes.UNKNOWN));
    }

    // Status
    JawsCLI.log('Creating stage and region: ' + this.evt.stage + '/' + this.evt.region);

    return BbPromise.resolve();
  }
  
  /**
   * Initialize needed AWS classes
   * @returns {Promise}
   * @private
   */
  _initAWS() {
    let config = {
      profile: this._awsProfile, 
      region : this.evt.region
    };

    this.CF  = require('../../utils/aws/CloudFormation')(config);
    this.Lambda  = require('../../utils/aws/Lambda')(config);
    this.S3  = require('../../utils/aws/S3')(config);  
  }
  
  /**
   * Update CF Template
   * - Add a stage to an existing project resources cloudformation template
   */

  _updateCfTemplate() {

    let projResoucesCfPath  = path.join(this.Jaws._projectRootPath, 'cloudformation', 'resources-cf.json'),
        cfTemplate          = JawsUtils.readAndParseJsonSync(projResoucesCfPath);

    // Add new stage to AllowedValues
    cfTemplate.Parameters.aaStage.AllowedValues.push(this.evt.stage);
    cfTemplate.Parameters.aaDataModelStage.AllowedValues.push(this.evt.stage);

    // Check if project name is in AllowedValues
    if (cfTemplate.Parameters.aaProjectName.AllowedValues.indexOf(this.Jaws._projectJson.name) == -1) {
      cfTemplate.Parameters.aaProjectName.AllowedValues.push(this.Jaws._projectJson.name);
    }

    // Write it
    return JawsUtils.writeFile(
        projResoucesCfPath,
        JSON.stringify(cfTemplate, null, 2)
    );
  }

  /**
   * Create Project Bucket
   * - if it does not exist
   */

  _createProjectBucket() {
    
    this._projectBucket = JawsUtils.generateRegionBucketName(this.evt.stage, this.evt.region, this.Jaws._projectJson.domain);
    JawsCLI.log('Creating a project region bucket on S3: ' + this._projectBucket + '...');
    return this.S3.sCreateBucket(this._projectBucket);

  }

  /**
   * Put ENV File
   * - Creates ENV file in regional project bucket
   */

  _putEnvFile() {
    let stage = this.evt.stage;

    let envFileContents = `JAWS_STAGE=${stage}
JAWS_DATA_MODEL_STAGE=${stage}`;

    return this.S3.sPutEnvFile(
        this._projectBucket,
        this.Jaws._projectJson.name,
        this.evt.stage,
        envFileContents);
  }

  /**
   * Put CF File
   */

  _putCfFile() {
    return this.CF.sPutCfFile(
        this.Jaws._projectRootPath,
        this._projectBucket,
        this.Jaws._projectJson.name,
        this.evt.stage,
        'resources');
  }


  /**
   * Create CloudFormation Stack
   */

  _createCfStack(cfTemplateUrl) {
    let _this = this;

    if (_this.evt.noExeCf) {
      let stackName = _this.CF.sGetResourcesStackName(_this.evt.stage, _this.Jaws._projectJson.name);

      JawsCLI.log(`Remember to run CloudFormation manually to create stack with name: ${stackName}`);
      JawsCLI.log('After creating CF stack, remember to put the IAM role outputs and jawsBucket in your project jaws.json in the correct stage/region.');

      return BbPromise.resolve();
    }

    JawsCLI.log('Creating CloudFormation Stack for your new stage (~5 mins)...');
    _this._spinner = JawsCLI.spinner();
    _this._spinner.start();

    // Create CF stack
    return _this.CF.sCreateResourcesStack(
        _this.Jaws._projectRootPath,
        _this.Jaws._projectJson.name,
        _this.evt.stage,
        _this.Jaws._projectJson.domain,
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
          projectBucket:           _this._projectBucket,
          apiFunctionAlias:     'LATEST',
        };

    if (cfStackData) {
      for (let i = 0; i < cfStackData.Outputs.length; i++) {
        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          regionObj.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
        }
      }
    }

    if (_this.Jaws._projectJson.stages[_this.evt.stage]) {
      _this.Jaws._projectJson.stages[_this.evt.stage].push(regionObj);
    } else {
      _this.Jaws._projectJson.stages[_this.evt.stage] = [regionObj];
    }

    return JawsUtils.writeFile(
        path.join(_this.Jaws._projectRootPath, 'jaws.json'),
        JSON.stringify(_this.Jaws._projectJson, null, 2)
    );
  }
}

module.exports = StageCreate;
