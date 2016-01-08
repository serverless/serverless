'use strict';

/**
 * Action: StageCreate
 * - Creates new stage, and new region in that stage for your project.
 * - Creates a new project S3 bucket for the new region and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Updates the project's s-project.json file with the new stage and region
 *
 * Options:
 * - stage                (String) the name of the new stage
 * - region               (String) the name of the new region in the provided stage
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
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'new stage name.'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Action
     */

    stageCreate(evt) {

      let _this    = this;
      _this.evt    = evt;

      // Get Meta instance
      this.meta = new this.S.classes.Meta(this.S);

      // Flow
      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._createRegion)
          .then(function() {
            SCli.log('Successfully created stage ' + _this.evt.options.stage + ' with region ' + _this.evt.options.region);

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

      let _this = this,
        overrides = {};

      // Skip if non-interactive or stage is provided
      if (!_this.S.config.interactive || (_this.evt.options.stage && _this.evt.options.region)) return BbPromise.resolve();

      ['stage'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this.evt.options[memberVarKey];
      });

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

      return _this.cliPromptInput(prompts, overrides)
          .then(function(answers) {
            _this.evt.options.stage = answers.stage.toLowerCase();
            BbPromise.resolve();
          })
          .then(function(){
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
      if (this.meta.data.stages[this.evt.options.stage]) {
        return BbPromise.reject(new SError('Stage ' + this.evt.options.stage + ' already exists'));
      }

      // Validate region
      if (awsMisc.validLambdaRegions.indexOf(this.evt.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.evt.options.region));
      }

      // Update Meta
      this.meta.data.stages[this.evt.options.stage] = {
        regions: {},
        variables: {
          stage: this.evt.options.stage
        }
      };

      // Save Meta before adding region
      this.meta.save();

      // Status
      SCli.log('Creating stage and region: ' + this.evt.options.stage + '/' + this.evt.options.region);

      return BbPromise.resolve();
    }

    /**
     * Create Region
     * - Call RegionCreate Action
     */

    _createRegion() {

      let _this = this;


      let evt = {
        options: {
          stage: _this.evt.options.stage,
          region: _this.evt.options.region,
          subaction: true
        }
      };
      return _this.S.actions.regionCreate(evt)
        .then(function(result) {

          // Overwrite this meta w/ RegionCreate's meta
          _this.meta = result.meta;
        });
    }
  }

  return( StageCreate );
};
