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
usage: jaws region create`,

      context:       'region',
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
   * Region Create
   */

  regionCreate(evt) {

    let _this  = this;
    _this.evt  = evt;

    // If CLI, parse arguments
    if (_this.Jaws.cli) {
      _this.evt = _this.Jaws.cli.options;
    }

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._validateEvent)
      .then(_this._promptStage)
      .then(_this._promptRegion)
      .then(_this._validateData)
      .then(_this._initAWS)
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
          JawsCLI.log('Successfully created region ' + _this.evt.region + ' within stage ' + _this.evt.stage);
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
    let stages = Object.keys(_this.Jaws._projectJson.stages);


    // If stage is provided, skip prompt
    if (_this.evt.stage) {
       return BbPromise.resolve();
    }

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

    return JawsCLI.select('Which stage are you creating a region for: ', choices, false)
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

    if (awsMisc.validLambdaRegions.indexOf(_this.evt.region) == -1) {
      return BbPromise.reject(new JawsError('Invalid region. Lambda not supported in ' + _this.evt.region, JawsError.errorCodes.UNKNOWN));
    }
    
    if (!_this.Jaws._projectJson.stages[_this.evt.stage]) {
      return BbPromise.reject(new JawsError('Stage ' + _this.evt.stage + ' does not exist', JawsError.errorCodes.UNKNOWN));
    }
    
    // Make sure region is not already defined
    if (_this.Jaws._projectJson.stages[_this.evt.stage].some(function(r) {
          return r.region == _this.evt.region;
        })) {
      throw new JawsError('Region "' + _this.evt.region + '" is already defined in the stage "' + _this.evt.stage + '"');
    }
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
   * - If it does not exist
   */

  _createProjectBucket() {
    let _this = this;
    
    _this.evt.projectBucket = JawsUtils.generateRegionBucketName(_this.evt.region, _this.Jaws._projectJson.domain);
    JawsCLI.log('Creating a project region bucket on S3: ' + _this.evt.projectBucket + '...');
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
