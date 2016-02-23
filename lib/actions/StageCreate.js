'use strict';

/**
 * Action: StageCreate
 * - Creates new stage, and new region in that stage for your project.
 * - Creates a new project S3 bucket for the new region and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 *
 * Options:
 * - stage                (String) the name of the new stage
 * - region               (String) the name of the new region in the provided stage
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'Error')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    os         = require('os'),
    fs         = require('fs'),
    BbPromise  = require('bluebird');

  let SUtils = require(path.join(serverlessPath, 'utils'));

  BbPromise.promisifyAll(fs);

  /**
   * StageCreate Class
   */

  class StageCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + StageCreate.name;
    }

    registerActions() {
      this.S.addAction(this.stageCreate.bind(this), {
        handler:       'stageCreate',
        description:   `Creates new stage for project
usage: serverless stage create`,
        context:       'stage',
        contextAction: 'create',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'AWS lambda supported region for your new stage.'
          }, {
            option:      'stage',
            shortcut:    's',
            description: 'new stage name.'
          }, {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Action
     */

    stageCreate(evt) {

      let _this      = this;
      _this.evt      = evt;
      _this.provider = _this._S.getProvider();
      _this.project  = _this._S.getProject();
      _this.profiles = _this.provider.getAllProfiles();

      // Flow
      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(function() {

          // Status
          SCli.log('Creating stage "' + _this.evt.options.stage + '"...');
        })
        .then(_this._createStage)
        .then(_this._createRegion)
        .then(function() {

          // Status
          SCli.log('Successfully created stage "' + _this.evt.options.stage + '"');

          /**
           * Return EVT
           */

          return _this.evt;
        });
    }

    /**
     * Prompt stage
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!_this.S.config.interactive || (_this.evt.options.stage && _this.evt.options.region)) return BbPromise.resolve();

      return BbPromise.try(function() {

          // Prompt for Stage

          let prompts = {
            properties: {}
          };

          prompts.properties.stage = {
            description: 'Enter a new stage name for this project: '.yellow,
            required:    true,
            message:     'Stage must be letters and numbers only',
            conform:     function(stage) {
              return SUtils.isStageNameValid(stage);
            }
          };

          return _this.cliPromptInput(prompts, { stage: _this.evt.options.stage });
        })
        .then(function(answers) {

          _this.evt.options.stage = answers.stage.toLowerCase();

        // Prompt for

        })
        .then(function() {

          if (!_this.profiles.length) {
            prompts.properties.awsAdminKeyId = {
              description: `You don\'t have any profiles for ${_this.provider.getProviderName()} on this machine.  Let's create one...

           Please enter the ACCESS KEY ID for your Admin AWS IAM User `.yellow,
              required:    true,
              message:     'Please enter a valid access key ID',
              conform:     function(key) {
                return (key) ? true : false;
              }
            };
            prompts.properties.awsAdminSecretKey = {
              description: 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: '.yellow,
              required:    true,
              message:     'Please enter a valid secret access key',
              conform:     function(key) {
                return (key) ? true : false;
              }
            }
          }

          // If access keys provided, save profile
          if (answers.awsAdminKeyId && answers.awsAdminSecretKey) {
            _this.profile = _this.project.getName();
            _this.provider.saveCredentials(
              answers.awsAdminKeyId,
              answers.awsAdminSecretKey,
              _this.profile
            );
            // Append to admin.env
            fs.appendFileSync(
              _this.project.getFilePath('admin.env'),
              `AWS_PROFILE=${_this.profile}`);
          } else if (_this.profile) {
            // Append stage-specific profile to admin.env
            fs.appendFileSync(
              _this.project.getFilePath('admin.env'),
              `AWS_PROFILE_${_this.evt.options.stage.toUpperCase()}=${_this.profile}`);
          }

        })
        .then(function() {

          if (_this.evt.options.region) return;

          return _this.cliPromptSelectRegion('Select a region for your new stage: ', false, false, _this.evt.options.region, false)
            .then(region => {
              _this.evt.options.region = region;
              BbPromise.resolve();
            });
        });
    }

    /**
     * Validate & Prepare
     * - Validate all data from event, interactive CLI or non interactive CLI
     * and prepare data
     */

    _validateAndPrepare() {

      // Check Params
      if (!this.evt.options.stage || !this.evt.options.region) {
        return BbPromise.reject(new SError('Missing stage or region'));
      }

      // Validate Stage
      if (!SUtils.isStageNameValid(this.evt.options.stage)) {
        return BbPromise.reject(new SError('Invalid stage name. Stage must be lowercase letters and numbers only.'));
      }

      // Validate Stage: Ensure stage isn't "local"
      if (this.evt.options.stage == 'local') {
        return BbPromise.reject(new SError('Stage ' + this.evt.options.stage + ' is reserved'));
      }

      // Validate stage: Ensure stage doesn't already exist
      if (this.S.getProject().validateStageExists(this.evt.options.stage)) {
        return BbPromise.reject(new SError('Stage ' + this.evt.options.stage + ' already exists'));
      }

      // Validate region
      if (this.S.getProvider().validRegions.indexOf(this.evt.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.evt.options.region));
      }

      return BbPromise.resolve();
    }

    /**
     * Create Stage
     */

    _createStage() {
      const project = this.S.getProject();
      const stage   = new this.S.classes.Stage(this.S, project, this.evt.options.stage);

      project.addStage(stage);

      return project.save();
    }

    /**
     * Create Region
     * - Call RegionCreate Action
     */

    _createRegion() {

      let _this = this;

      let evt = {
        options: {
          stage:   _this.evt.options.stage,
          region:  _this.evt.options.region,
          noExeCf: _this.evt.options.noExeCf ? true : false
        }
      };

      return _this.S.actions.regionCreate(evt);
    }
  }

  return( StageCreate );
};
