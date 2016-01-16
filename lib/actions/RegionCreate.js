'use strict';

/**
 * Action: RegionCreate
 * - Creates new region for your project in a provided stage. If project only
 *   has one stage, no stage needs to be provided.
 * - Creates a new project S3 bucket for the new region and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Updates the project's s-project.json file with the new region
 *
 * Options:
 * - region               (String) the name of the new region
 * - stage                (String) the name of the stage you want to create a region in.  Optional if only one stage in project.
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
      SError     = require(path.join(serverlessPath, 'ServerlessError')),
      SCli       = require(path.join(serverlessPath, 'utils/cli')),
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
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    regionCreate(evt) {

      let _this    = this;
      _this.evt    = evt;

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._initAWS)
          .then(_this._putEnvFile)
          .then(function() {

            SCli.log('Successfully created region "' + _this.evt.options.region + '" within stage "' + _this.evt.options.stage + '"');

            /**
             * Return EVT
             */

            return _this.evt;

          });
    }

    /**
     * Prompt stage and region
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!_this.S.config.interactive || (_this.evt.options.stage && _this.evt.options.region)) return BbPromise.resolve();

      return _this.cliPromptSelectStage('Select an existing stage for your new region: ', _this.evt.options.stage, false)
          .then(stage => {
            _this.evt.options.stage = stage;
            BbPromise.resolve();
          })
          .then(function(){
            return _this.cliPromptSelectRegion('Select a new region for your existing stage: ', false, false, _this.evt.options.region, _this.evt.options.stage)
                .then(region => {
                  _this.evt.options.region = region;
                  BbPromise.resolve();
                });
          });
    }

    /**
     * Validate & Prepare
     * - Validate all data from event, interactive CLI or non interactive CLI
     *   and prepare data
     */

    _validateAndPrepare() {

      let _this = this;

      // Check Params
      if (!_this.evt.options.stage || !_this.evt.options.region) {
        return BbPromise.reject(new SError('Missing stage or region'));
      }

      // Validate stage: make sure stage exists
      if (!_this.S.state.getStages().indexOf(_this.evt.options.stage) == -1) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure Lambda is supported in that region
      if (awsMisc.validLambdaRegions.indexOf(_this.evt.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.evt.options.region));
      }

      // Validate region: make sure region is not already defined
      if (_this.S.state.getRegions(_this.evt.options.stage).indexOf(_this.evt.options.region) !== -1) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" already exists in stage "' + _this.evt.options.stage + '"'));
      }

      // Update and save Meta
      _this.meta = _this.S.state.getMeta();

      _this.meta.stages[_this.evt.options.stage].regions[_this.evt.options.region] = {
        variables: {
          region: _this.evt.options.region
        }
      };

      return _this.meta.save();
    }

    /**
     * Initialize needed AWS classes
     */

    _initAWS() {

      let awsConfig = {
        region:          this.evt.options.region,
        accessKeyId:     this.S.config.awsAdminKeyId,
        secretAccessKey: this.S.config.awsAdminSecretKey
      };

      this.CF      = require('../utils/aws/CloudFormation')(awsConfig);
      this.Lambda  = require('../utils/aws/Lambda')(awsConfig);
      this.S3      = require('../utils/aws/S3')(awsConfig);
    }

    /**
     * Put ENV File
     * - Creates ENV file in Serverless stage/region bucket
     */

    _putEnvFile() {

      // Load project
      let project = new this.S.classes.Project(this.S, { projectPath: this.S.config.projectPath });

      let envFileContents = `SERVERLESS_STAGE=${this.evt.options.stage}
SERVERLESS_DATA_MODEL_STAGE=${this.evt.options.stage}
SERVERLESS_PROJECT_NAME=${this.S.state.getProject().name}`;

      return this.S3.sPutEnvFile(
          this.meta.variables.projectBucket,
          this.S.state.getProject().name,
          this.evt.options.stage,
          this.evt.options.region,
          envFileContents);
    }
  }

  return( RegionCreate );
};
