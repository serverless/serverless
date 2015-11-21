'use strict';

/**
 * Action: RegionCreate
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
 * RegionCreate Class
 */

class RegionCreate extends JawsPlugin {

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
    return 'jaws.core.' + RegionCreate.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */
  registerActions() {
    this.Jaws.addAction(this.regionCreate.bind(this), {
      handler:       'regionCreate',
      description:   `Creates new region for a stage in a project
usage: jaws region create <region> <stageName>`,
      context:       'region',
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
  regionCreate(evt) {
    this.evt = evt;
    
    if (this.Jaws.cli) {

      // Add options to evt
      this.evt = this.Jaws.cli.options;

      // Add region & stage from params.
      this.evt.region = this.Jaws.cli.params[0];
      this.evt.stage = this.Jaws.cli.params[1];

    }

    let _this = this;

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._validateData)
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
        JawsCLI.log('Successfully created region ' + _this.evt.region + ' in stage ' + _this.evt.stage);
      });
  }

  _validateData() {
    let _this = this;

    if (!_this.evt.region || !_this.evt.stage) {
      return BbPromise.reject(new JawsError('Must specify a region and stage'), JawsError.errorCodes.UNKNOWN);
    }
    
    let validRegions = awsMisc.validLambdaRegions;
    let validStages = Object.keys(_this.Jaws._projectJson.stage);
    
    // Check if project has stage
    if (!validStages.length) {
      return BbPromise.reject(new JawsError('This project has no stage'));
    }  
    
    // Check if region is valid 
    console.log(validRegions.indexOf(_this.evt.region))
    if(validRegions.indexOf(_this.evt.region) === -1) {
      return BbPromise.reject(new JawsError('the region you provided is not valid'), JawsError.errorCodes.UNKNOWN);
    }

    // Check if stage exists in project
    if(validStages.indexOf(_this.evt.stage) === -1) {
      return BbPromise.reject(new JawsError('the stage you provided does not exist'), JawsError.errorCodes.UNKNOWN);
    }
    
    // Make sure region is not already defined
    if (_this.Jaws._projectJson.stage[_this.evt.stage].some(function(r) {
        return r.region == _this.evt.region;
      })) {
      return BbPromise.reject(new JawsError('Region "' + _this.evt.region + '" is already defined in the stage "' + _this.evt.stage + '"'));
    }

    let config = {
      profile: _this._awsProfile, 
      region : _this.evt.region
    };

    this.CF  = require('../../utils/aws/CloudFormation')(config);
    this.Lambda  = require('../../utils/aws/Lambda')(config);
    this.S3  = require('../../utils/aws/S3')(config);

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
    
    _this.Jaws._projectJson.stage[_this.evt.stage].push(regionObj);


    return JawsUtils.writeFile(
      path.join(_this.Jaws._projectRootPath, 'jaws.json'),
      JSON.stringify(_this.Jaws._projectJson, null, 2)
    );
  }
}

module.exports = RegionCreate;
