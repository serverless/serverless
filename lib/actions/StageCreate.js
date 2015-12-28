'use strict';

/**
 * Action: StageCreate
 * - Creates new stage, and new region in that stage for your project.
 * - Creates a new project S3 bucket for the new region and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Updates the project's s-project.json file with the new stage and region
 *
 * Event Properties:
 * - stage                (String) the name of the new stage
 * - region               (String) the name of the new region in the provided stage
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {
  const path = require('path'),
      SError  = require(path.join(serverlessPath, 'ServerlessError')),
      SCli    = require(path.join(serverlessPath, 'utils/cli')),
      os         = require('os'),
      fs         = require('fs'),
      BbPromise  = require('bluebird'),
      awsMisc    = require(path.join(serverlessPath, 'utils/aws/Misc')),
      SUtils  = require(path.join(serverlessPath, 'utils'));

  BbPromise.promisifyAll(fs);

  /**
   * StageCreate Class
   */

  class StageCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
      this.evt = {};
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
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'new stage name.'
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

    stageCreate(evt) {

      let _this = this;

      if(evt) {
        _this.evt = evt;
        _this.S._interactive = false;
      }

      // If CLI, parse arguments
      if (_this.S.cli) {

        _this.evt = JSON.parse(JSON.stringify(_this.S.cli.options)); // Important: Clone objects, don't refer to them

        if (_this.S.cli.options.nonInteractive) {
          _this.S._interactive = false;
        }
      }

      return _this.S.validateProject()
        .bind(_this)
        .then(_this._prompt)
        .then(_this._validateAndPrepare)
        .then(_this._updateProjectCfTemplate)
        .then(_this._updateProjectJson)
        .then(function() {
          SCli.log('Successfully created stage ' + _this.evt.stage + ' with region ' + _this.evt.region);
          return _this.evt;
        });
    }

    /**
     * Prompt stage and region
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive or stage is provided
      if (!_this.S._interactive || _this.evt.stage) return BbPromise.resolve();

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

      return _this.cliPromptInput(prompts, null)
        .then(function(answers) {
          _this.evt.stage = answers.stage.toLowerCase();
          BbPromise.resolve();
        })
        .then(function(){
          return _this.cliPromptSelectRegion('Select a region for your new stage: ', false, false, _this.evt.region, false)
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

      // non interactive validation
      if (!this.S._interactive) {

        // Check Params
        if (!this.evt.stage || !this.evt.region) {
          return BbPromise.reject(new SError('Missing stage or region'));
        }
      }

      // Validate stage
      if (!SUtils.isStageNameValid(this.evt.stage)) {
        return BbPromise.reject(new SError('Invalid stage name. Stage must be letters and numbers only.', SError.errorCodes.UNKNOWN));
      }

      // Validate stage: Ensure stage isn't "local"
      this.evt.stage = this.evt.stage.toLowerCase().replace(/\W+/g, '').substring(0, 15);
      if (this.evt.stage == 'local') {
        return BbPromise.reject(new SError('Stage ' + this.evt.stage + ' is reserved'));
      }

      // Validate stage: Ensure stage doesn't already exist
      if (this.S._meta.private.stages[this.evt.stage]) {
        return BbPromise.reject(new SError('Stage ' + this.evt.stage + ' already exists', SError.errorCodes.UNKNOWN));
      }

      // Validate region
      if (awsMisc.validLambdaRegions.indexOf(this.evt.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.evt.region, SError.errorCodes.UNKNOWN));
      }

      // Status
      SCli.log('Creating stage and region: ' + this.evt.stage + '/' + this.evt.region);

      return BbPromise.resolve();
    }

    /**
     * Update Project CF Template
     * - Add a stage s-project.json cloudFormation property
     */

    _updateProjectCfTemplate() {

    }

    /**
     * Create Region
     * - Call RegionCreate Action
     */

    _createRegion() {

    }
  }

  return( StageCreate );
};
