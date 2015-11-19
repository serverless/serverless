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
      awsMisc   = require('../../utils/aws/Misc'),
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
   *
   * @param noExeCf
   * @param region
   * @param stage
   * @returns {Promise}
   */
  stageCreate(evt) {
    let _this = this;
    _this.evt = evt;

    if (_this.Jaws.cli) {

      // Add options to evt
      _this.evt = _this.Jaws.cli.options;

      // Add region & stage from params.
      _this.evt.region = _this.Jaws.cli.params[0];
      _this.evt.stage = _this.Jaws.cli.params[1];

    }

    let config = {
      profile: _this._awsProfile, 
      region : _this.evt.region
    };

    _this.CF  = require('../../utils/aws/CloudFormation')(config);
    _this.Lambda  = require('../../utils/aws/Lambda')(config);
    _this.S3  = require('../../utils/aws/S3')(config);

    if (!_this.evt.region || !_this.evt.stage) {
      return BbPromise.reject(new JawsError('Must specify a region and stage'), JawsError.errorCodes.UNKNOWN);
    }


    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._validateData)
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
   * Create jaws bucket if it does not exist
   *
   * @returns {Promise}
   * @private
   */
  _createJawsBucket() {
    let _this = this;
    this._jawsBucket = JawsUtils.generateJawsBucketName(_this.evt.stage, _this.evt.region, this.Jaws._projectJson.domain);
    JawsUtils.jawsDebug('Creating jaws s3 bucket: ', this._jawsBucket);
    return _this.S3.sCreateBucket(this._jawsBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in JAWS stage/region bucket
   * @returns {Promise}
   * @private
   */
  _putEnvFile() {
    let _this = this;
    let stage = _this.evt.stage;

    let envFileContents = `JAWS_STAGE=${stage}
JAWS_DATA_MODEL_STAGE=${stage}`;

    return _this.S3.sPutEnvFile(
      this._jawsBucket,
      this.Jaws._projectJson.name,
      _this.evt.stage,
      envFileContents);
  }

  /**
   * Put CF File
   * @returns {Promise}
   * @private
   */

  _putCfFile() {
    let _this = this;
    return _this.CF.sPutCfFile(
      this.Jaws._projectRootPath,
      this._jawsBucket,
      this.Jaws._projectJson.name,
      _this.evt.stage,
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
   * update Project JSON
   *
   * @param cfStackData
   * @private
   */
  _updateProjectJson(cfStackData) {
    let _this     = this,
        regionObj = {
          region:               _this.evt.region,
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

    if (_this.Jaws._projectJson.stage[_this.evt.stage]) {
      _this.Jaws._projectJson.stage[_this.evt.stage].push(regionObj);
    } else {
      _this.Jaws._projectJson.stage[_this.evt.stage] = [regionObj];
    }

    return JawsUtils.writeFile(
      path.join(_this.Jaws._projectRootPath, 'jaws.json'),
      JSON.stringify(_this.Jaws._projectJson, null, 2)
    );
  }
}

module.exports = StageCreate;
