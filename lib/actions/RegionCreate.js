'use strict';

/**
 * Action: RegionCreate
 * - Creates new region for your project in a provided stage. If project only
 *   has one stage, no stage needs to be provided.
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Updates the project's s-project.json file with the new region
 *
 * Options:
 * - region               (String) the name of the new region
 * - stage                (String) the name of the stage you want to create a region in.  Optional if only one stage in project.
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(S) {

  const path   = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird');

  /**
   * RegionCreate Class
   */

  class RegionCreate extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.regionCreate.bind(this), {
        handler:       'regionCreate',
        description:   'Creates new region for a stage in a project. Usage: serverless region create',
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
            description: 'Prevents auto-deploying resources to this region'
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
      _this.project = S.getProject();

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(function() {

            // Status
            SCli.log('Creating region "' + _this.evt.options.region + '" in stage "' + _this.evt.options.stage + '"...');
          })
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
      if (!S.config.interactive || (this.evt.options.stage && this.evt.options.region)) return BbPromise.resolve();

      return this.cliPromptSelectStage('Select an existing stage for your new region: ', this.evt.options.stage, false)
          .then(stage => this.evt.options.stage = stage)
          .then(() => this.cliPromptSelectRegion('Select a new region for your stage: ', false, false, this.evt.options.region, this.evt.options.stage))
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
      if (S.getProvider().validRegions.indexOf(_this.evt.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + _this.evt.options.region));
      }

      // Validate region: make sure region is not already defined
      if (_this.project.validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" already exists in stage "' + _this.evt.options.stage + '"'));
      }

      // Add region to stage
      _this.stage   = _this.project.getStage(_this.evt.options.stage);
      _this.region  = new S.classes.Region({ name: _this.evt.options.region }, _this.stage);

      // Add default project variables
      _this.region.addVariables({
        region: _this.evt.options.region
      });
      _this.stage.setRegion(_this.region);
      return _this.region.save();
    }

    /**
     * Deploy Resources to Stage/Region
     */

    _deployResources() {

      return S.actions.resourcesDeploy({
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
