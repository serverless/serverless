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
      this.options = {};
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
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    regionCreate(options) {

      let _this    = this;
      this.options = options || {};

      // If CLI, parse arguments
      if (this.S.cli && (!options || !options.subaction)) {
        this.options = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (this.S.cli.options.nonInteractive) this.S.config.interactive = false;
      }

      // Get Meta instance
      this.meta = new this.S.classes.Meta(this.S);

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._initAWS)
          .then(_this._putEnvFile)
          .then(function() {
            SCli.log('Successfully created region ' + _this.options.region + ' within stage ' + _this.options.stage);

            // Return
            return {
              options: _this.options
            }
          });
    }

    /**
     * Prompt stage and region
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!_this.S.config.interactive || (_this.options.stage && _this.options.region)) return BbPromise.resolve();

      return _this.cliPromptSelectStage('Select an existing stage for your new region: ', _this.options.stage, false)
          .then(stage => {
            _this.options.stage = stage;
            BbPromise.resolve();
          })
          .then(function(){
            return _this.cliPromptSelectRegion('Select a new region for your existing stage: ', false, false, _this.options.region, _this.options.stage)
                .then(region => {
                  _this.options.region = region;
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
      if (!_this.options.stage || !_this.options.region) {
        return BbPromise.reject(new SError('Missing stage or region'));
      }

      // Validate stage: make sure stage exists
      if (!_this.meta.data.private.stages[_this.options.stage]) {
        return BbPromise.reject(new SError('Stage ' + _this.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure Lambda is supported in that region
      if (awsMisc.validLambdaRegions.indexOf(_this.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.options.region));
      }

      // Validate region: make sure region is not already defined
      if (_this.meta.data.private.stages[_this.options.stage].regions[_this.options.region]) {
        return BbPromise.reject(new SError('Region "' + _this.options.region + '" is already defined in the stage "' + _this.options.stage + '"'));
      }

      // Update Meta
      _this.meta.data.private.stages[_this.options.stage].regions[_this.options.region] = {
        variables: {
          region: _this.options.region
        }
      };

      // Save Meta before deploying resources
      _this.meta.save();
    }

    /**
     * Initialize needed AWS classes
     */

    _initAWS() {

      let awsConfig = {
        region:          this.options.region,
        accessKeyId:     this.S.config.awsAdminKeyId,
        secretAccessKey: this.S.config.awsAdminSecretKey
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

      // Load project
      let project = new this.S.classes.Project(this.S, { projectPath: this.S.config.projectPath });

      let envFileContents = `SERVERLESS_STAGE=${this.options.stage}
SERVERLESS_DATA_MODEL_STAGE=${this.options.stage}
SERVERLESS_PROJECT_NAME=${project.data.name}`;

      return this.S3.sPutEnvFile(
          this.meta.data.private.variables.projectBucket,
          project.data.name,
          this.options.stage,
          this.options.region,
          envFileContents);
    }
  }

  return( RegionCreate );
};
