'use strict';

/**
 * Action: StageRemove
 * - Removes a stage.
 *
 * Options:
 * - stage                (String) the name of the new stage
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    fs         = require('fs'),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils'));

  BbPromise.promisifyAll(fs);

  /**
   * StageRemove Class
   */

  class StageRemove extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + StageRemove.name;
    }

    registerActions() {
      this.S.addAction(this.stageRemove.bind(this), {
        handler:       'stageRemove',
        description:   `Removes a stage from project
usage: serverless stage remove`,
        context:       'stage',
        contextAction: 'remove',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'The stage you want to remove'
          }, {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Optional - Don\'t execute CloudFormation, just remove it. Default: false'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Action
     */

    stageRemove(evt) {
      this.evt    = evt;

      // Flow
      return this._prompt()
        .bind(this)
        .then(this._validateAndPrepare)
        .then(() => { SCli.log(`Removing stage "${this.evt.options.stage}"...`); })
        .then(this._removeAllRegions)
        .then(this._removeMeta)
        .then(this._removeVariables)
        .then(() => {

          // Status
          SCli.log('Successfully removed stage "' + this.evt.options.stage + '"');
          this.evt.data.stage = this.evt.options.stage;
          /**
           * Return EVT
           */

          return this.evt;
        });
    }

    /**
     * Prompt stage and region
     */

    _prompt() {

      // Skip if non-interactive or stage is provided
      if (!this.S.config.interactive || this.evt.options.stage) return BbPromise.resolve();

      if (!this.S.state.meta.getStages().length) throw new SError('No existing stages in the project');

      return this.cliPromptSelectStage('Select a stage to remove: ', this.evt.options.stage, false)
        .then(stage => { this.evt.options.stage = stage; })

    }

    /**
     * Validate & Prepare
     * - Validate all data from event, interactive CLI or non interactive CLI
     * and prepare data
     */

    _validateAndPrepare() {

      // Check Params
      if (!this.evt.options.stage) {
        return BbPromise.reject(new SError('Missing stage'));
      }

      // Validate Stage
      if (!SUtils.isStageNameValid(this.evt.options.stage)) {
        return BbPromise.reject(new SError('Invalid stage name. Stage must be lowercase letters and numbers only.'));
      }

      return BbPromise.resolve();
    }

    _removeVariables() {
      let fileName = `s-variables-${this.evt.options.stage}.json`;
      return fs.unlinkAsync(path.join(this.S.config.projectPath, '_meta', 'variables', fileName));
    }

    _removeMeta() {
      // Update Meta
      this.meta = this.S.state.getMeta();

      delete this.meta.stages[this.evt.options.stage]

      // Save Meta before adding region
      return this.meta.save();
    }

    /**
     * Remove Regions
     * - Call RegionRemove Action for each region of the stage
     */

    _removeAllRegions() {
      let stageRegions = this.S.state.meta.getRegions(this.evt.options.stage)

      return BbPromise.each(stageRegions, (region) => {
        let evt = {
          options: {
            stage:   this.evt.options.stage,
            region:  region,
            noExeCf: !!this.evt.options.noExeCf
          }
        };
        return this.S.actions.regionRemove(evt);
      });
    }

  }

  return StageRemove;
};
