'use strict';

/**
 * Action: RegionCreate
 * - Creates new region for your project in a provided stage. If project only
 *   has one stage, no stage needs to be provided.
 * - Creates a new project S3 bucket for the new region and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Updates the project's s-project.json file with the new region
 *
 * Event Properties:
 * - region               (String) the name of the new region
 * - stage                (String) the name of the stage you want to create a region in.
 *                                 Optional if only one stage in project.
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
 * RegionCreate Class
 */

class RegionCreate extends SPlugin {

  constructor(S, config) {
    super(S, config);
    this.evt = {};
  }

  static getName() {
    return 'serverless.core.' + RegionCreate.name;
  }

  registerActions() {
    this.S.addAction(this.regionCreate.bind(this), {
      handler:       'regionCreate',
      description:   `Creates new region for a stage in a project
usage: serverless region create`,

      context:       'region',
      contextAction: 'create',
      options:       [
        {
          option:      'region',
          shortcut:    'r',
          description: 'AWS lambda supported region for a stage.'
        },
        {
          option:      'stage',
          shortcut:    's',
          description: 'The stage your want to create a region for.'
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
  regionCreate(evt) {

    let _this = this;

    if(evt) {
      _this.evt = evt;
      _this.S._interactive = false;
    }

    // If CLI, parse arguments
    if (_this.S.cli) {
      _this.evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

      if (_this.S.cli.options.nonInteractive) {
        _this.S._interactive = false;
      }
    }

    return _this.S.validateProject()
      .bind(_this)
      .then(_this._prompt)
      .then(_this._validateAndPrepare)
      .then(_this._initAWS)
      .then(_this._createRegionBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._updateProjectJson)
      .then(function() {
        SCli.log('Successfully created region ' + _this.evt.region + ' within stage ' + _this.evt.stage);
        return _this.evt;
      });
  }

  /**
   * Prompt stage and region
   */
  _prompt() {
    let _this = this;

    return _this.cliPromptSelectStage('Select an existing stage for your new region: ', _this.evt.stage, false)
      .then(stage => {

        _this.evt.stage = stage;
        BbPromise.resolve();
      })
      .then(function(){
        return _this.cliPromptSelectRegion('Select a new region for your existing stage: ', false, _this.evt.region, _this.evt.stage)
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
    let _this = this;

    // non interactive validation
    if (!_this.S._interactive) {

      // Check Params
      if (!_this.evt.stage || !_this.evt.region) {
        return BbPromise.reject(new SError('Missing stage or region'));
      }
    }

    // validate stage: make sure stage exists
    if (!_this.S._projectJson.stages[_this.evt.stage]) {
      return BbPromise.reject(new SError('Stage ' + _this.evt.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
    }


    // validate region: make sure Lambda is supported in that region
    if (awsMisc.validLambdaRegions.indexOf(_this.evt.region) == -1) {
      return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.evt.region, SError.errorCodes.UNKNOWN));
    }

    // validate region: make sure region is not already defined
    if (_this.S._projectJson.stages[_this.evt.stage].some(function(r) {
          return r.region == _this.evt.region;
        })) {
      return BbPromise.reject(new SError('Region "' + _this.evt.region + '" is already defined in the stage "' + _this.evt.stage + '"'));
    }
  }

  /**
   * Initialize needed AWS classes
   */

  _initAWS() {

    let awsConfig = {
      region:          this.evt.region,
      accessKeyId:     this.S._awsAdminKeyId,
      secretAccessKey: this.S._awsAdminSecretKey,
    };

    this.CF  = require('../utils/aws/CloudFormation')(awsConfig);
    this.Lambda  = require('../utils/aws/Lambda')(awsConfig);
    this.S3  = require('../utils/aws/S3')(awsConfig);
  }

  /**
   * Create Project Bucket
   * - If it does not exist
   */

  _createRegionBucket() {
    this.evt.regionBucket = SUtils.generateRegionBucketName(this.evt.region, this.S._projectJson.domain);
    SCli.log('Creating a region bucket on S3: ' + this.evt.regionBucket + '...');
    return this.S3.sCreateBucket(this.evt.regionBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in Serverless stage/region bucket
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
      SCli.log('After creating CF stack, remember to put the IAM role outputs and serverlessBucket in your project s-project.json in the correct stage/region.');

      return BbPromise.resolve();
    }

    SCli.log('Creating CloudFormation Stack for your new region (~5 mins)...');
    this._spinner = SCli.spinner();
    this._spinner.start();

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
    let _this     = this;
    let regionObj = {
          region:               _this.evt.region,
          iamRoleArnLambda:     '',
          regionBucket:           _this.evt.regionBucket,
        };

    if (cfStackData) {
      for (let i = 0; i < cfStackData.Outputs.length; i++) {
        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          regionObj.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
          _this.evt.iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
        }
      }

      // Save StackName to Evt
      _this.evt.stageCfStack = cfStackData.StackName;
    }

    _this.S._projectJson.stages[_this.evt.stage].push(regionObj);

    return SUtils.writeFile(
        path.join(_this.S._projectRootPath, 's-project.json'),
        JSON.stringify(_this.S._projectJson, null, 2)
    );
  }
}

module.exports = RegionCreate;
