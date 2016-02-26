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

  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'Error')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils'));

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
          },
          {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Prevents creating a ENV file in your project bucket for this region'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    regionCreate(evt) {

      let _this     = this;
      _this.evt     = evt;
      _this.project = _this.S.getProject();

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(function() {

          // Status
          SCli.log('Creating region "' + _this.evt.options.region + '" in stage "' + _this.evt.options.stage + '"...');
        })
        .then(_this._putEnvFile)
        .then(_this._deployResources)
        .then(function() {

          SCli.log('Successfully created region "' + _this.evt.options.region + '" within stage "' + _this.evt.options.stage + '"');

          return _this.evt;

        });
    }

    /**
     * Prompt stage and region
     */

    _prompt() {
      // Skip if non-interactive or stage is provided
      if (!this.S.config.interactive || (this.evt.options.stage && this.evt.options.region)) return BbPromise.resolve();

      return this.cliPromptSelectStage('Select an existing stage for your new region: ', this.evt.options.stage, false)
        .then(stage => this.evt.options.stage = stage)
        .then(() => this.cliPromptSelectRegion('Select a new region for your existing stage: ', false, false, this.evt.options.region, this.evt.options.stage))
        .then(region => this.evt.options.region = region);
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
      if (!_this.project.validateStageExists(_this.evt.options.stage)) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure Lambda is supported in that region
      if (_this.S.getProvider().validRegions.indexOf(_this.evt.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.evt.options.region));
      }

      // Validate region: make sure region is not already defined
      if (_this.project.validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" already exists in stage "' + _this.evt.options.stage + '"'));
      }

      // Add region to stage
      _this.stage   = _this.project.getStage(_this.evt.options.stage);
      _this.region  = new _this.S.classes.Region(_this.S, _this.stage, _this.evt.options.region);

      // Add default project variables
      _this.region.addVariables({
        region: _this.evt.options.region
      });
      _this.stage.setRegion(_this.region);
      return _this.region.save();
    }

    /**
     * Put ENV File
     * - Creates ENV file in Serverless stage/region bucket
     */

    _putEnvFile() {

      // If noExeCf option, skip
      if (this.evt.options.noExeCf) return BbPromise.resolve();

      // Create ENV file in new region
      const key = ['serverless', this.project.getName(), this.stage.getName(), this.region.getName(), 'envVars', '.env'].join('/');

      let envFileContents = `SERVERLESS_STAGE=${this.stage.getName()}
SERVERLESS_DATA_MODEL_STAGE=${this.stage.getName()}
SERVERLESS_PROJECT_NAME=${this.project.getName()}`;

      let params = {
        Bucket:      this.project.getVariables().projectBucket,
        Key:         key,
        ACL:         'private',
        ContentType: 'text/plain',
        Body:        envFileContents
      };

      return this.S.getProvider()
        .uploadToProjectBucket(params, this.stage.getName(), this.project.getVariables().projectBucketRegion);
    }

    /**
     * Deploy Resources to Stage/Region
     */

    _deployResources() {

      return this.S.actions.resourcesDeploy({
        options: {
          stage:   this.evt.options.stage,
          region:  this.evt.options.region,
          noExeCf: this.evt.options.noExeCf ? true : false
        }
      });
    }


  }


  return( RegionCreate );
};
