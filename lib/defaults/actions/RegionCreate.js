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
    this.evt = {};
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
          description: 'AWS lambda supported region for a stage'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'The stage your want to create a region for'
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
   * Region Create
   */

  regionCreate(evt) {

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
      .then(_this._createProjectBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._updateProjectJson)
      .then(function() {
        JawsCLI.log('Successfully created region ' + _this.evt.region + ' within stage ' + _this.evt.stage);
      });
  }

  /**
   * Prompt stage if it's missing
   * @returns {Promise}
   * @private
   */
  _promptStage() {
    let _this = this;
    let stages = Object.keys(_this.Jaws._projectJson.stages);


    // Skip if non-interactive
    if (!_this.Jaws._interactive || _this.evt.stage) return BbPromise.resolve();

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
    let _this = this;

    // non interactive validation
    if (!_this.Jaws._interactive) {

      // Check API Keys
      if (!_this.Jaws._awsProfile) {
        if (!_this.Jaws._awsAdminKeyId || !_this.Jaws._awsAdminSecretKey) {
          return BbPromise.reject(new JawsError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
        }
      }
      // Check Params
      if (!_this.evt.stage || !_this.evt.region) {
        return BbPromise.reject(new JawsError('Missing stage or region'));
      }
    }
    
    // validate stage: make sure stage exists
    if (!_this.Jaws._projectJson.stages[_this.evt.stage]) {
      return BbPromise.reject(new JawsError('Stage ' + _this.evt.stage + ' does not exist in your project', JawsError.errorCodes.UNKNOWN));
    }
    
    // validate region: make sure Lambda is supported in that region
    if (awsMisc.validLambdaRegions.indexOf(_this.evt.region) == -1) {
      return BbPromise.reject(new JawsError('Invalid region. Lambda not supported in ' + _this.evt.region, JawsError.errorCodes.UNKNOWN));
    }
    
    // validate region: make sure region is not already defined
    if (_this.Jaws._projectJson.stages[_this.evt.stage].some(function(r) {
          return r.region == _this.evt.region;
        })) {
      return BbPromise.reject(new JawsError('Region "' + _this.evt.region + '" is already defined in the stage "' + _this.evt.stage + '"'));  
    }
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
   * Create Project Bucket
   * - If it does not exist
   */

  _createProjectBucket() {  
    this.evt.projectBucket = JawsUtils.generateRegionBucketName(this.evt.region, this.Jaws._projectJson.domain);
    JawsCLI.log('Creating a project region bucket on S3: ' + this.evt.projectBucket + '...');
    return this.S3.sCreateBucket(this.evt.projectBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in JAWS stage/region bucket
   */

  _putEnvFile() {
    let stage = this.evt.stage;

    let envFileContents = `JAWS_STAGE=${stage}
JAWS_DATA_MODEL_STAGE=${stage}`;

    return this.S3.sPutEnvFile(
        this.evt.projectBucket,
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
        this.evt.projectBucket,
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

    JawsCLI.log('Creating CloudFormation Stack for your new region (~5 mins)...');
    this._spinner = JawsCLI.spinner();
    this._spinner.start();

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
    let _this     = this;
    let regionObj = {
          region:               _this.evt.region,
          iamRoleArnLambda:     '',
          projectBucket:           _this.evt.projectBucket,
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
