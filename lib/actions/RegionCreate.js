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
          },
          {
            option:      'noEnv',
            shortcut:    'e',
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

      let _this    = this;
      _this.evt    = evt;

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
        .then(function() {
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
      if (!_this.S.state.validateStageExists(_this.evt.options.stage)) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure Lambda is supported in that region
      if (awsMisc.validLambdaRegions.indexOf(_this.evt.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.evt.options.region));
      }

      // Validate region: make sure region is not already defined
      if (_this.S.state.validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
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
     * Create Project Bucket
     */

    _createProjectBucket() {

      if (this.evt.options.noExeCf) {

        // If no CloudFormation is set, skip project bucket creation
        this.projectBucket = 'SET_YOUR_PROJECT_BUCKET_NAME_HERE';
        SCli.log('Notice -- Skipping project bucket creation.  Don\'t forget to point this project to your existing project bucket in _meta/s-variables-common.json.  You will also need to manually create the file structure on the bucket and add a .env file to the "development" stage folder.');
        return BbPromise.resolve();

      } else {

        // Check If Bucket Exists
        return this.S3.getBucketAclPromised({
            Bucket: this.S.state.getMeta().variables.projectBucket
          })
          .then(function(data) {
            console.log(data);
          })
          .catch(function(e) {
            console.log(e);
          });
        //SCli.log('Creating your project bucket on S3: ' + this.projectBucket + '...');
        //return this.S3.sCreateBucket(this.projectBucket);
      }
    }

    /**
     * Put ENV File
     * - Creates ENV file in Serverless stage/region bucket
     */

    _putEnvFile() {

      // If noEnv option, skip
      if (this.evt.options.noExeCf) return BbPromise.resolve();

      // Init AWS S3
      let awsConfig = {
        region:          this.evt.options.region,
        accessKeyId:     this.S.config.awsAdminKeyId,
        secretAccessKey: this.S.config.awsAdminSecretKey
      };
      this.S3      = require('../utils/aws/S3')(awsConfig);

      // Create ENV file in new region
      let envFileContents = `SERVERLESS_STAGE=${this.evt.options.stage}
SERVERLESS_DATA_MODEL_STAGE=${this.evt.options.stage}
SERVERLESS_REGION=${this.evt.options.region}
SERVERLESS_PROJECT_NAME=${this.S.state.getProject().name}`;

      return this.S3.sPutEnvFile(
        this.S.state.getMeta().variables.projectBucket,
        this.S.state.getProject().name,
        this.evt.options.stage,
        this.evt.options.region,
        envFileContents);
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
