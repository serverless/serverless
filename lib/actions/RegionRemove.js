'use strict';

/**
 * Action: RegionRemove
 * - Removes a region from your project in a provided stage. If project only
 *   has one stage, no stage needs to be provided.
 * - Removes CF stack by default, unless noExeCf option is set to true
 *
 * Options:
 * - region               (String) the name of the new region
 * - stage                (String) the name of the stage you want to create a region in.  Optional if only one stage in project.
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(S) {

  const path    = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird'),
    fs         = BbPromise.promisifyAll(require('fs')),
    _          = require('lodash');

  /**
   * RegionCreate Class
   */

  class RegionRemove extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.regionRemove.bind(this), {
        handler:       'regionRemove',
        description:   'Removes a region from a stage in a project. Usage: serverless region remove',

        context:       'region',
        contextAction: 'remove',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'The region you want to remove'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'The stage you want to remove a region from'
          },
          {
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

    regionRemove(evt) {
      this.evt = evt;

      return this._prompt()
        .bind(this)
        .then(this._validateAndPrepare)
        .then(() => { SCli.log(`Removing region "${this.evt.options.region}" in stage "${this.evt.options.stage}"...`); })
        .then(this._removeFunctions)
        .then(this._removeResources)
        .then(this._removeRegionFromProject)
        .then(this._removeVariables)
        .then((reply) => {
          SCli.log(`Successfully removed region "${this.evt.options.region}" within stage "${this.evt.options.stage}"`);
          this.evt.data.region = this.evt.options.region;
          return this.evt;
        });
    }


    /**
     * Prompt stage and region
     */

    _prompt() {
      // Skip if non-interactive or stage is provided
      if (!S.config.interactive || (this.evt.options.stage && this.evt.options.region)) return BbPromise.resolve();

      if (!S.getProject().getAllStages().length) return BbPromise.reject(new SError('No existing stages in the project'));

      return this.cliPromptSelectStage('Select an existing stage: ', this.evt.options.stage, false)
        .then(stage => { this.evt.options.stage = stage; })
        .then(() => {
          if (S.getProject().getAllRegions(this.evt.options.stage).length)
            return this.cliPromptSelectRegion('Select a region to remove: ', false, true, this.evt.options.region, this.evt.options.stage);
          else
            return BbPromise.reject(new SError(`No existing regions in "${this.evt.options.stage}" stage`));
        })
        .then(region => { this.evt.options.region = region; });
    }

    /**
     * Validate & Prepare
     * - Validate all data from event, interactive CLI or non interactive CLI
     *   and prepare data
     */

    _validateAndPrepare() {

      // Check Params
      if (!this.evt.options.stage || !this.evt.options.region) {
        return BbPromise.reject(new SError('Missing stage or region'));
      }

      // Validate stage: make sure stage exists
      if (!S.getProject().validateStageExists(this.evt.options.stage)) {
        return BbPromise.reject(new SError('Stage ' + this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Validate region: make sure region exists in stage
      if (!S.getProject().validateRegionExists(this.evt.options.stage, this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + this.evt.options.region + '" does not exists in stage "' + this.evt.options.stage + '"'));
      }
    }

    /**
     * Remove Region From Project
     */

    _removeRegionFromProject() {
      // Update and save Meta
      S.getProject().getStage(this.evt.options.stage).removeRegion(this.evt.options.region);
      return S.getProject().getStage(this.evt.options.stage).save();
    }

    /**
     * Remove Variables
     * - Remove region variables from _meta folder
     */

    _removeVariables() {
      let fileName = `s-variables-${this.evt.options.stage}-${this.evt.options.region.replace(/-/g, '')}.json`;
      return fs.unlinkAsync(S.getProject().getRootPath( '_meta', 'variables', fileName ));
    }

    /**
     * Remove Resources from Stage/Region
     */

    _removeResources() {
      return S.actions.resourcesRemove({
        options: {
          stage:   this.evt.options.stage,
          region:  this.evt.options.region,
          noExeCf: !!this.evt.options.noExeCf
        }
      });
    }

   /**
     * Remove Functions from Stage/Region
     */

    _removeFunctions() {
      return S.actions.functionRemove({
        options: {
          stage:   this.evt.options.stage,
          region:  this.evt.options.region,
          all:     true
        }
      });
    }
  }

  return RegionRemove;
};
