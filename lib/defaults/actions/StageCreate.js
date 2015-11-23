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
          description: ''
        },
        {
          option:      'stage',
          shortcut:    's',
          description: ''
        },
        {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Don\'t execute CloudFormation, just generate it'
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
    _this.evt = evt;

    return _this.Jaws.validateProject()
        .bind(_this)
        .then(_this._validateData)
        .then(function() {

          // Config AWS Services
          let awsConfig = {
            region:          _this.evt.region,
            accessKeyId:     _this.Jaws._awsAdminKeyId,
            secretAccessKey: _this.Jaws._awsAdminSecretKey,
          };
          _this.CF  = require('../../utils/aws/CloudFormation')(awsConfig);
          _this.Lambda  = require('../../utils/aws/Lambda')(awsConfig);
          _this.S3  = require('../../utils/aws/S3')(awsConfig);

        })
        .then(_this._updateCfTemplate)
        .then(_this._createProjectBucket)
        .then(_this._putEnvFile)
        .then(_this._putCfFile)
        .then((cfTemplateUrl) => {
          if (_this.evt.noExeCf) {
            let stackName = _this.CF.sGetResourcesStackName(_this.evt.stage, _this.Jaws._projectJson.name);

            JawsCLI.log(`Remember to run CloudFormation manually to create stack with name: ${stackName}`);
            JawsCLI.log('After creating CF stack, remember to put the IAM role outputs and jawsBucket in your project jaws.json in the correct stage/region.');

            return false;
          } else {
            return _this._createCfStack(cfTemplateUrl);
          }
        })
        .then(_this._updateProjectJson)
        .then(function() {
          JawsCLI.log('Successfully created stage ' + _this.evt.stage + ' w/ region ' + _this.evt.region);
        });
  }

  /**
   * Validate Data
   */

  _validateData() {
    let _this = this;

    // If CLI, parse arguments
    if (_this.Jaws.cli) {
      // Add options to evt
      _this.evt = _this.Jaws.cli.options;
    }

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._validateEvent)
      .then(_this._promptStage)
      .then(_this._promptRegion)
      .then(_this._validateData)
      .then(_this._initAWS)
      .then(() => {
        return JawsUtils.addStageToResourcesCf(this.Jaws._projectRootPath, _this.evt.stage);
      })
      .then(_this._createJawsBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then((cfTemplateUrl) => {
        if (_this.evt.noExeCf) {
          let stackName = _this.CF.sGetResourcesStackName(_this.evt.stage, _this.Jaws._projectJson.name);

          JawsCLI.log(`Remember to run CloudFormation manually.
!!MAKE SURE!! to create stack with name: ${stackName}

After creating CF stack, remember to put the IAM role outputs and jawsBucket in your project jaws.json in the correct stage/region.`);

          return false;
        } else {
          return _this._createCfStack(cfTemplateUrl);
        }
      })
      .then(_this._updateProjectJson)
      .then(function() {
        JawsCLI.log('Successfully created stage ' + _this.evt.stage + ' in region ' + _this.evt.region);
      });
  }
  
  /**
   * Non-Interactive Validations
   */
  _validateEvent() {
    let _this = this;
    if (_this.Jaws._interactive) return BbPromise.resolve();

    if (!this.Jaws._awsProfile) {// Check API Keys
      if (!_this.Jaws._awsAdminKeyId || !_this.Jaws._awsAdminSecretKey) {
        return BbPromise.reject(new JawsError('Missing AWS API Key and/or AWS Secret Key'), JawsError.errorCodes.UNKNOWN);
      }
    }
    // Check Params
    if (!_this.evt.stage || !_this.evt.region) {
      return BbPromise.reject(new JawsError('Missing stage or region'));
    }
  }
  
  /**
   * Prompt stage if it's missing
   * @returns {Promise}
   * @private
   */
  _promptStage() {
    let _this = this;

    if (_this.evt.stage) {
       return BbPromise.resolve();
    }

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
    
    return this.promptInput(prompts, null) // no overides cause we now know that stage is missing
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
    // we don't need to check if it's interactive because if it's not
    // we'll catch that before we even get here (check non interactive validation above)
    if (_this.evt.region) {
       return BbPromise.resolve();
    }
    
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
   * Validates stage & region
   * @returns {Promise}
   * @private
   */
  _validateData() {
    let _this = this;

    if (!JawsUtils.isStageNameValid(_this.evt.stage)) {
      return BbPromise.reject(new JawsError('Invalid stage name. Only a-Z0-9 allowed', JawsError.errorCodes.UNKNOWN));
    }

    let stageAlreadyExists = true;
    try {
      JawsUtils.getProjRegionConfigForStage(this.Jaws._projectJson, _this.evt.stage, _this.evt.region);
    } catch (e) {
      //good stage dont exist
      stageAlreadyExists = false;
    }

    //If we got here stage doesn't exist
    if (stageAlreadyExists) {
      return BbPromise.reject(new JawsError('Stage ' + _this.evt.stage + ' already exists', JawsError.errorCodes.UNKNOWN));
    }

    if (awsMisc.validLambdaRegions.indexOf(_this.evt.region) == -1) {
      return BbPromise.reject(new JawsError('Invalid region. Lambda not supported in ' + _this.evt.region, JawsError.errorCodes.UNKNOWN));
    }

    // Status
    JawsCLI.log('Creating stage and region: ' + _this.evt.stage + '/' + _this.evt.region);

    return BbPromise.resolve();
  }
  
  /**
   * Initialize needed AWS classes
   * @returns {Promise}
   * @private
   */
  _initAWS() {
    let _this = this;
    let config = {
      profile: _this._awsProfile, 
      region : _this.evt.region
    };

    _this.CF  = require('../../utils/aws/CloudFormation')(config);
    _this.Lambda  = require('../../utils/aws/Lambda')(config);
    _this.S3  = require('../../utils/aws/S3')(config);  
  }

  /**
   * Create Project Bucket
   * - if it does not exist
   */

  _createProjectBucket() {
    let _this = this;

    // our first encounter with AWS. If we don't output this message now, there
    // will be an unpleasent pause for our users
    JawsCLI.log('Creating CloudFormation Stack for your new stage (~5 mins)...');
    this._spinner = JawsCLI.spinner();
    this._spinner.start();

    _this._projectBucket = JawsUtils.generateRegionBucketName(_this.evt.stage, _this.evt.region, this.Jaws._projectJson.domain);
    JawsCLI.log('Creating a project region bucket on S3: ' + _this._projectBucket + '...');
    return _this.S3.sCreateBucket(_this._projectBucket);

  }

  /**
   * Put ENV File
   * - Creates ENV file in regional project bucket
   */

  _putEnvFile() {
    let _this = this;
    let stage = _this.evt.stage;

    let envFileContents = `JAWS_STAGE=${stage}
JAWS_DATA_MODEL_STAGE=${stage}`;

    return _this.S3.sPutEnvFile(
        this._projectBucket,
        this.Jaws._projectJson.name,
        _this.evt.stage,
        envFileContents);
  }

  /**
   * Put CF File
   */

  _putCfFile() {
    
    let _this = this;
    return _this.CF.sPutCfFile(
        this.Jaws._projectRootPath,
        this._projectBucket,
        this.Jaws._projectJson.name,
        _this.evt.stage,
        'resources');
  }

  /**
   * Update CF Template
   * - Add a stage to an existing project resources cloudformation template
   */

  _updateCfTemplate() {

    let _this           = this,
        projResoucesCfPath  = path.join(_this.Jaws._projectRootPath, 'cloudformation', 'resources-cf.json'),
        cfTemplate      = JawsUtils.readAndParseJsonSync(projResoucesCfPath);

    // Add new stage to AllowedValues
    cfTemplate.Parameters.aaStage.AllowedValues.push(_this.evt.stage);
    cfTemplate.Parameters.aaDataModelStage.AllowedValues.push(_this.evt.stage);

    // Check if project name is in AllowedValues
    if (cfTemplate.Parameters.aaProjectName.AllowedValues.indexOf(_this.Jaws._projectJson.name) == -1) {
      cfTemplate.Parameters.aaProjectName.AllowedValues.push(_this.Jaws._projectJson.name);
    }

    // Write it
    return JawsUtils.writeFile(
        projResoucesCfPath,
        JSON.stringify(cfTemplate, null, 2)
    );
  }

  /**
   * Create CloudFormation Stack
   */

  _createCfStack(cfTemplateUrl) {
    let _this = this;

    // Create CF stack
    return _this.CF.sCreateResourcesStack(
        this.Jaws._projectRootPath,
        this.Jaws._projectJson.name,
        _this.evt.stage,
        this.Jaws._projectJson.domain,
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
          jawsBucket:           _this._projectBucket,
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
