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
 * - stage                (String) the name of the stage you want to create a region in.  Optional if only one stage in project.
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
      SError     = require(path.join(serverlessPath, 'ServerlessError')),
      SCli       = require(path.join(serverlessPath, 'utils/cli')),
      os         = require('os'),
      fs         = require('fs'),
      BbPromise  = require('bluebird'),
      awsMisc    = require(path.join(serverlessPath, 'utils/aws/Misc')),
      SUtils     = require(path.join(serverlessPath, 'utils'));

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
            shortcut:    'i',
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

      if (evt) {
        _this.evt = evt;
        _this.S._interactive = false;
      }

      // If CLI and not subaction, parse options
      if (_this.S.cli && (!evt || !evt._subaction)) {
        _this.evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (_this.S.cli.options.nonInteractive) _this.S._interactive = false;
      }

      return _this.S.validateProject()
          .bind(_this)
          .then(_this._prompt)
          .then(_this._validateAndPrepare)
          .then(_this._initAWS)
          .then(_this._putEnvFile)
          .then(_this._putCfFile)
          .then(_this._createCfStack)
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

      // Skip if non-interactive or stage is provided
      if (!_this.S._interactive || (_this.evt.stage && _this.evt.region)) return BbPromise.resolve();

      return _this.cliPromptSelectStage('Select an existing stage for your new region: ', _this.evt.stage, false)
          .then(stage => {
            _this.evt.stage = stage;
            BbPromise.resolve();
          })
          .then(function(){
            return _this.cliPromptSelectRegion('Select a new region for your existing stage: ', false, false, _this.evt.region, _this.evt.stage)
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

      // Check Params
      if (!_this.evt.stage || !_this.evt.region) {
        return BbPromise.reject(new SError('Missing stage or region'));
      }

      // Validate stage: make sure stage exists
      if (!_this.S._meta.private.stages[_this.evt.stage]) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure Lambda is supported in that region
      if (awsMisc.validLambdaRegions.indexOf(_this.evt.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.evt.region, SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure region is not already defined
      if (_this.S._meta.private.stages[_this.evt.stage].regions[_this.evt.region]) {
        return BbPromise.reject(new SError('Region "' + _this.evt.region + '" is already defined in the stage "' + _this.evt.stage + '"'));
      }

      // Set Global Meta
      this.S._meta.private.stages[this.evt.stage].regions[this.evt.region] = {
        variables: {}
      };
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
     * Put ENV File
     * - Creates ENV file in Serverless stage/region bucket
     */

    _putEnvFile() {

      let stage = this.evt.stage;

      let envFileContents = `SERVERLESS_STAGE=${stage}
SERVERLESS_DATA_MODEL_STAGE=${stage}
SERVERLESS_PROJECT_NAME=${this.S._project.name}`;

      return this.S3.sPutEnvFile(
          this.S._meta.private.variables.projectBucket,
          this.S._project.name,
          this.evt.stage,
          this.evt.region,
          envFileContents);
    }

    /**
     * Put CF File
     */

    _putCfFile() {
      return this.CF.sPutCfFile(
          this.S._projectRootPath,
          this.S._meta.private.projectBucket,
          this.S._project.name,
          this.evt.stage,
          this.evt.region);
    }

    /**
     * Create CloudFormation Stack
     */

    _createCfStack(cfTemplateUrl) {

      let _this = this;

      if (_this.evt.noExeCf) {
        let stackName = _this.CF.sGetResourcesStackName(_this.evt.stage, _this.S._project.name);

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
          _this.S._project.name,
          _this.evt.stage,
          _this.S._meta.variables.domain,
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
  }

  return( RegionCreate );
};
