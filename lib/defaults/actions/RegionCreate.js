'use strict';

/**
 * Action: RegionCreate
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
 * RegionCreate Class
 */

class RegionCreate extends JawsPlugin {

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  static getName() {
    return 'jaws.core.' + RegionCreate.name;
  }

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
   * Region Create
   */

  regionCreate(evt) {

    let _this  = this;
    _this.evt  = evt;

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
          JawsCLI.log('Successfully created region ' + _this.evt.region + ' in stage ' + _this.evt.stage);
        });
  }

  /**
   * Validate Data
   */

  _validateData() {

    let _this = this;

    // If CLI, parse CLI input
    if (_this.Jaws.cli) {

      // Add options to evt
      _this.evt = _this.Jaws.cli.options;

      // Add region & stage from params.
      _this.evt.stage = _this.Jaws.cli.params[0];
      _this.evt.region = _this.Jaws.cli.params[1];
    }

    // Validate stage & region
    if (!_this.evt.region || !_this.evt.stage) {
      throw new JawsError('Must specify a stage and region');
    }

    let validRegions = awsMisc.validLambdaRegions;
    let validStages = Object.keys(_this.Jaws._projectJson.stages);
    
    // Check if project has stage
    if (!validStages.length) {
      throw new JawsError('This project has no stage');
    }
    
    // Check if region is valid 
    if(validRegions.indexOf(_this.evt.region) === -1) {
      throw new JawsError('the region you provided is not valid');
    }

    // Check if stage exists in project
    if(validStages.indexOf(_this.evt.stage) === -1) {
      throw new JawsError('the stage you provided does not exist');
    }
    
    // Make sure region is not already defined
    if (_this.Jaws._projectJson.stages[_this.evt.stage].some(function(r) {
          return r.region == _this.evt.region;
        })) {
      throw new JawsError('Region "' + _this.evt.region + '" is already defined in the stage "' + _this.evt.stage + '"');
    }
  }

  /**
   * Create Project Bucket
   * - If it does not exist
   */

  _createProjectBucket() {
    let _this = this;
    _this.evt.projectBucket = JawsUtils.generateJawsBucketName(_this.evt.region, _this.Jaws._projectJson.domain);
    JawsUtils.jawsDebug('Creating project s3 bucket: ', _this.evt.projectBucket);
    return _this.S3.sCreateBucket(_this.evt.projectBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in JAWS stage/region bucket
   */

  _putEnvFile() {
    let _this = this;
    let stage = _this.evt.stage;
    let envFileContents = `JAWS_STAGE=${stage}
JAWS_DATA_MODEL_STAGE=${stage}`;

    return _this.S3.sPutEnvFile(
        this.evt.projectBucket,
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
        _this.Jaws._projectRootPath,
        _this.evt.projectBucket,
        _this.Jaws._projectJson.name,
        _this.evt.stage,
        'resources');
  }

  /**
   * Create CloudFormation Stack
   */

  _createCfStack(cfTemplateUrl) {
    let _this = this;

    JawsCLI.log('Creating CloudFormation Stack for your new region (~5 mins)...');
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
          jawsBucket:           _this.evt.projectBucket,
          apiFunctionAlias:     'LATEST',
        };

    // Get apiFunctionAlias from another region in this stage
    let region = _this.Jaws._projectJson.stages[_this.evt.stage][0];
    if (region.apiFunctionAlias) regionObj.apiFunctionAlias = region.apiFunctionAlias;

    if (cfStackData) {
      for (let i = 0; i < cfStackData.Outputs.length; i++) {
        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          regionObj.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
        }
      }
    }
    
    _this.Jaws._projectJson.stages[_this.evt.stage].push(regionObj);

    return JawsUtils.writeFile(
        path.join(_this.Jaws._projectRootPath, 'jaws.json'),
        JSON.stringify(_this.Jaws._projectJson, null, 2)
    );
  }
}

module.exports = RegionCreate;
