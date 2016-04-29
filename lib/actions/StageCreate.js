'use strict';

/**
 * Action: StageCreate
 * - Creates new stage, and new region in that stage for your project.
 * - Creates CF stack by default, unless noExeCf option is set to true
 *
 * Options:
 * - stage                (String) the name of the new stage
 * - region               (String) the name of the new region in the provided stage
 * - profile              (String) the profile to use for this stage
 */

module.exports = function(S) {

  const path  = require('path'),
    SUtils    = S.utils,
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    os        = require('os'),
    BbPromise = require('bluebird'),
    fs        = BbPromise.promisifyAll(require('fs'));

  /**
   * StageCreate Class
   */

  class StageCreate extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.stageCreate.bind(this), {
        handler:       'stageCreate',
        description:   'Creates new stage for project. Usage: serverless stage create',
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
            option:      'profile',
            shortcut:    'p',
            description: 'A profile to use for this stage'
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
      _this.provider = S.getProvider();
      _this.project  = S.getProject();

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

            return _this.evt;
          });
    }

    /**
     * Prompt
     * - Prompts for stage name
     * - Prompts for profile, or allows user to create a new profile for this stage
     */

    _prompt() {

      let _this = this;

      if (!S.config.interactive) return BbPromise.resolve();

      return BbPromise.try(function() {

            // Prompt for Stage

            // Skip if stage is provided already
            if (_this.evt.options.stage) return BbPromise.resolve();

            let prompts = {
              properties: {}
            };

            prompts.properties.stage = {
              description: 'Enter a new stage name for this project: '.yellow,
              default:     'dev',
              required:    true,
              message:     'Stage must be letters only',
              conform:     function(stage) {
                return S.classes.Stage.validateStage(stage);
              }
            };

            return _this.cliPromptInput(prompts, { stage: _this.evt.options.stage })
                .then(function(answers) {
                  _this.evt.options.stage = answers.stage.toLowerCase();
                });
          })
          .then(function() {

            // Select/Create Profile
            if (_this.evt.options.profile) return;

            let choices = [
              {
                key: '',
                value: true,
                label: 'Existing Profile'
              },
              {
                key: '',
                value: false,
                label: 'Create A New Profile'
              }
            ];

            return _this.cliPromptSelect(`For the "${_this.evt.options.stage}" stage, do you want to use an existing ${_this.provider.getProviderName()} profile or create a new one?`, choices, false)
                .then(function(values) {

                  // If "Use Existing" is selected, skip
                  if (values[0].value) return;

                  let prompts = { properties: {} };

                  prompts.properties.awsAdminKeyId = {
                    description: `Please enter the ACCESS KEY ID for your Admin AWS IAM User: `.yellow,
                    required: true,
                    message: 'Please enter a valid access key ID',
                    conform: function (key) {
                      return (key) ? true : false;
                    }
                  };
                  prompts.properties.awsAdminSecretKey = {
                    description: 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: '.yellow,
                    required: true,
                    message: 'Please enter a valid secret access key',
                    conform: function (key) {
                      return (key) ? true : false;
                    }
                  };
                  prompts.properties.profile = {
                    description: 'Enter the name of your new profile: '.yellow,
                    default: (_this.project.getName() + '_' + _this.evt.options.stage).toLowerCase(),
                    required: true,
                    message: 'Please enter a profile name',
                    conform: function (profile) {
                      return (profile) ? true : false;
                    }
                  };

                  return _this.cliPromptInput(prompts, {})
                      .then(function(answers) {

                        _this.evt.options.profile = answers.profile;

                        // If access keys provided, save profile
                        _this.provider.saveCredentials(
                            answers.awsAdminKeyId,
                            answers.awsAdminSecretKey,
                            _this.evt.options.profile,
                            _this.evt.options.stage
                        );
                      });
                })
                .then(function() {

                  // Skip if user just made a new profile
                  if (_this.evt.options.profile) return;

                  // Select A Profile
                  _this.profiles = _this.provider.getAllProfiles();
                  
                  if (Object.keys(_this.profiles).length === 0) throw new SError(`You have no profiles for ${_this.provider.getProviderName()} on this machine.  Please re-run this command and create a new profile.`);

                  // Prompt: profile select
                  let choices = [];
                  for (let i = 0; i < Object.keys(_this.profiles).length; i++) {
                    choices.push({
                      key:   '',
                      value: Object.keys(_this.profiles)[i],
                      label: Object.keys(_this.profiles)[i]
                    });
                  }

                  return _this.cliPromptSelect('Select a profile for your project: ', choices, false)
                      .then(function(results) {
                        _this.evt.options.profile = results[0].value;
                      });
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
      if (!this.evt.options.stage) {
        return BbPromise.reject(new SError('Missing stage option'));
      }

      // Validate Stage
      if (!S.classes.Stage.validateStage(this.evt.options.stage)) {
        return BbPromise.reject(new SError('Invalid stage name. Stage must be lowercase letters and numbers only.'));
      }

      // Validate stage: Ensure stage doesn't already exist
      if (S.getProject().validateStageExists(this.evt.options.stage)) {
        return BbPromise.reject(new SError('Stage ' + this.evt.options.stage + ' already exists'));
      }

      // Write to admin.env
      let adminEnv = S.getProject().getRootPath('admin.env'),
          profileEnvVar = 'AWS_' + this.evt.options.stage.toUpperCase() + '_PROFILE';
      if (SUtils.fileExistsSync(adminEnv)) {
        fs.appendFileSync(adminEnv, os.EOL + `${profileEnvVar}=${this.evt.options.profile}`); // Append to admin.env
      } else {
        SUtils.writeFileSync(adminEnv, `${profileEnvVar}=${this.evt.options.profile}`); // Create admin.env
      }

      // Add ENV var
      process.env[profileEnvVar] = this.evt.options.profile;

      return BbPromise.resolve();
    }

    /**
     * Create Stage
     */

    _createStage() {
      this.stage = new S.classes.Stage({ name: this.evt.options.stage });

      // Add default project variables
      this.stage.addVariables({
        stage: this.evt.options.stage
      });

      this.project.setStage(this.stage);
      return this.stage.save();
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

      return S.actions.regionCreate(evt);
    }
  }

  return( StageCreate );
};
