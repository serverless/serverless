'use strict';

/**
 * Action: StageCreate
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      os         = require('os'),
      BbPromise  = require('bluebird'),
      AWSUtils   = require('../../utils/aws'),
      JawsUtils  = require('../../utils');

let fs = require('fs');
BbPromise.promisifyAll(fs);

/**
 * StageCreate Class
 */

class StageCreate extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
    this._stage      = "";
    this._region     = "";
    this._jawsBucket = "";
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + StageCreate.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */
  registerActions() {
    this.Jaws.action(this.stageCreate.bind(this), {
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
    return Promise.resolve();
  }

  /**
   *
   * @param noExeCf
   * @param region
   * @param stage
   * @returns {Promise}
   */
  stageCreate(noExeCf, region, stage) {
    let _this = this;

    if (!region || !stage) {
      return Promise.reject(new JawsError('Must specify a region and stage'), JawsError.errorCodes.UNKNOWN);
    }

    this._stage  = stage;
    this._region = region;

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._validateData)
      .then(() => {
        return JawsUtils.addStageToResourcesCf(this.Jaws._projectRootPath, this._stage);
      })
      .then(_this._createJawsBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then((cfTemplateUrl) => {
        if (noExeCf) {
          let stackName = AWSUtils.cfGetResourcesStackName(_this._stage, _this.Jaws._projectJson.name);

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
        JawsCLI.log('Successfully created stage ' + _this._stage + ' in region ' + _this._region);
      });
  }

  _validateData() {
    if (!JawsUtils.isStageNameValid(this._stage)) {
      throw new JawsError('Invalid stage name. Only a-Z0-9 allowed', JawsError.errorCodes.UNKNOWN);
    }

    let stageAlreadyExists = true;
    try {
      JawsUtils.getProjRegionConfigForStage(this.Jaws._projectJson, this._stage, this._region);
    } catch (e) {
      //good stage dont exist
      stageAlreadyExists = false;
    }

    //If we got here stage doesn't exist
    if (stageAlreadyExists) {
      throw new JawsError('Stage ' + this._stage + ' already exists', JawsError.errorCodes.UNKNOWN);
    }

    if (AWSUtils.validLambdaRegions.indexOf(this._region) == -1) {
      throw new JawsError('Invalid region. Lambda not supported in ' + this._region, JawsError.errorCodes.UNKNOWN);
    }
  }

  /**
   * Create jaws bucket if it does not exist
   *
   * @returns {Promise}
   * @private
   */
  _createJawsBucket() {
    this._jawsBucket = JawsUtils.generateJawsBucketName(this._stage, this._region, this.Jaws._projectJson.domain);
    JawsUtils.jawsDebug('Creating jaws s3 bucket: ', this._jawsBucket);
    return AWSUtils.createBucket(this.Jaws._awsProfile, this._region, this._jawsBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in JAWS stage/region bucket
   * @returns {Promise}
   * @private
   */
  _putEnvFile() {
    let stage = this._stage;

    let envFileContents = `JAWS_STAGE=${stage}
JAWS_DATA_MODEL_STAGE=${stage}`;

    return AWSUtils.putEnvFile(
      this.Jaws._awsProfile,
      this._region,
      this._jawsBucket,
      this.Jaws._projectJson.name,
      this._stage,
      envFileContents);
  }

  /**
   * Put CF File
   * @returns {Promise}
   * @private
   */

  _putCfFile() {
    return AWSUtils.putCfFile(
      this.Jaws._awsProfile,
      this.Jaws._projectRootPath,
      this._region,
      this._jawsBucket,
      this.Jaws._projectJson.name,
      this._stage,
      'resources');
  }

  /**
   * Create CloudFormation Stack
   *
   * @param cfTemplateUrl
   * @returns {Promise}
   * @private
   */
  _createCfStack(cfTemplateUrl) {
    let _this = this;

    JawsCLI.log('Creating CloudFormation Stack for your new project (~5 mins)...');
    this._spinner = JawsCLI.spinner();
    this._spinner.start();

    // Create CF stack
    return AWSUtils.cfCreateResourcesStack(
      this.Jaws._awsProfile,
      this._region,
      this.Jaws._projectRootPath,
      this.Jaws._projectJson.name,
      this._stage,
      this.Jaws._projectJson.domain,
      '',
      cfTemplateUrl
      )
      .then(cfData => {
        return AWSUtils.monitorCf(cfData, _this.Jaws._awsProfile, _this._region, 'create')
          .then(cfStackData => {
            _this._spinner.stop(true);
            return cfStackData;
          });
      });
  }

  /**
   * update Project JSON
   *
   * @param cfStackData
   * @private
   */
  _updateProjectJson(cfStackData) {
    let _this     = this,
        regionObj = {
          region:               _this._region,
          iamRoleArnLambda:     '',
          iamRoleArnApiGateway: '',
          jawsBucket:           _this._jawsBucket,
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

    if (_this.Jaws._projectJson.stages[_this._stage]) {
      _this.Jaws._projectJson.stages[_this._stage].push(regionObj);
    } else {
      _this.Jaws._projectJson.stages[_this._stage] = [regionObj];
    }

    return JawsUtils.writeFile(
      path.join(_this.Jaws._projectRootPath, 'jaws.json'),
      JSON.stringify(_this.Jaws._projectJson, null, 2)
    );
  }
}

module.exports = StageCreate;
