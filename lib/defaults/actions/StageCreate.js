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
usage: jaws stage create <region> <stageName>`,
      context:       'stage',
      contextAction: 'create',
      options:       [
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

    // If CLI, parse arguments
    if (_this.Jaws.cli) {

      // Add options to evt
      _this.evt = _this.Jaws.cli.options;

      // Add region & stage from params.
      _this.evt.region = _this.Jaws.cli.params[0];
      _this.evt.stage = _this.Jaws.cli.params[1];

    }

    // Config AWS Services
    let awsConfig = {
      region:          _this.evt.region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };
    _this.CF  = require('../../utils/aws/CloudFormation')(awsConfig);
    _this.Lambda  = require('../../utils/aws/Lambda')(awsConfig);
    _this.S3  = require('../../utils/aws/S3')(awsConfig);

    // Validate stage & region
    if (!_this.evt.region || !_this.evt.stage) {
      return BbPromise.reject(new JawsError('Must specify a region and stage'), JawsError.errorCodes.UNKNOWN);
    }

    return _this.Jaws.validateProject()
      .bind(_this)
      .then(_this._validateData)
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
        JawsCLI.log('Successfully created stage ' + _this.evt.stage + ' in region ' + _this.evt.region);
      });
  }

  /**
   * Validate Data
   */

  _validateData() {
    let _this = this;
    if (!JawsUtils.isStageNameValid(_this.evt.stage)) {
      throw new JawsError('Invalid stage name. Only a-Z0-9 allowed', JawsError.errorCodes.UNKNOWN);
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
      throw new JawsError('Stage ' + _this.evt.stage + ' already exists', JawsError.errorCodes.UNKNOWN);
    }

    if (awsMisc.validLambdaRegions.indexOf(_this.evt.region) == -1) {
      throw new JawsError('Invalid region. Lambda not supported in ' + _this.evt.region, JawsError.errorCodes.UNKNOWN);
    }
  }

  /**
   * Create Project Bucket
   * - if it does not exist
   */

  _createProjectBucket() {
    let _this = this;
    _this._projectBucket = JawsUtils.generateJawsBucketName(_this.evt.stage, _this.evt.region, this.Jaws._projectJson.domain);
    JawsUtils.jawsDebug('Creating jaws s3 bucket: ', _this._projectBucket);
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

    JawsCLI.log('Creating CloudFormation Stack for your new stage (~5 mins)...');
    this._spinner = JawsCLI.spinner();
    this._spinner.start();

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

        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnApiGateway') {
          regionObj.iamRoleArnApiGateway = cfStackData.Outputs[i].OutputValue;
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
