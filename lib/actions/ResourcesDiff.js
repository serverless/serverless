'use strict';

/**
 * Action: ResourcesDiff
 * - Shows the differences in the CLI between your project's CloudFormation template
 *   and a CloudFormation template from a deployed stack in a project stage and region
 *
 * Options:
 * - region               (String) the region you want to diff from
 * - stage                (String) the stage you want to diff from
 */

module.exports = function(S) {

  const path     = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird'),
    fs         = BbPromise.promisifyAll(require('fs')),
    _          = require('lodash'),
    diff       = require('json-diff').diff,
    diffString = require('json-diff').diffString;

  /**
   * ResourcesDiff Class
   */

  class ResourcesDiff extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.resourcesDiff.bind(this), {
        handler:       'resourcesDiff',
        description:   "show the differences in the CLI between your project's CloudFormation template and a CloudFormation template from a deployed stack in a project stage and region",
        context:       'resources',
        contextAction: 'diff',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'The region you want to diff from'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'The stage you want to diff from'
          },
          {
            option:      'json',
            shortcut:    'j',
            description: 'Optional - Output unformatted JSON.'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    resourcesDiff(evt) {
      this.evt = evt;

      return this._prompt()
        .bind(this)
        .then(this._validateAndPrepare)
        .then(() => BbPromise.props({
          local: this._getLocalTemplate(),
          deployed: this._getDeployedTemplate()
        }))
        .then((templates) => {
          this.evt.data.difference = diff(templates.deployed, templates.local) || {}

          if (S.config.interactive && !this.evt.options.json) {
            let difference = diffString(templates.deployed, templates.local);

            if (difference.trim() === 'undefined') {
              SCli.log('Resource templates are equal');
            }
            else {
              console.log(difference)
            }
          }
          if (this.evt.options.json) {
            console.log(JSON.stringify(this.evt.data.difference, null, '    '));
          }

          return this.evt;
        });
    }

    /**
     * Prompt stage and region
     */

    _prompt() {
      // Skip if non-interactive or stage and region is provided
      if (!S.config.interactive || (this.evt.options.stage && this.evt.options.region)) return BbPromise.resolve();

      if (!S.getProject().getAllStages().length) return BbPromise.reject(new SError('No existing stages in the project'));

      return this.cliPromptSelectStage('Select an existing stage: ', this.evt.options.stage, false)
        .then(stage => { this.evt.options.stage = stage; })
        .then(() => {
          if (S.getProject().getAllRegions(this.evt.options.stage).length)
            return this.cliPromptSelectRegion('Select a region: ', false, true, this.evt.options.region, this.evt.options.stage);
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

      // Validate region: make sure region exists
      if (!S.getProject().validateRegionExists(this.evt.options.stage, this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + this.evt.options.region + '" does not exists in stage "' + this.evt.options.stage + '"'));
      }

    }

    _getLocalTemplate() {
      const resourcesDeployEvt = {
              options: {
                stage:   this.evt.options.stage,
                region:  this.evt.options.region,
                noExeCf: true,
                quiet: true
              }
            };

      const fileName = `s-resources-cf-${this.evt.options.stage}-${this.evt.options.region.replace(/-/g,'')}.json`,
            filePath = S.getProject().getRootPath( '_meta', 'resources', fileName );


      return S.actions.resourcesDeploy(resourcesDeployEvt)
        .then(() => fs.readFileAsync(filePath, 'utf8'))
        .then((data) => JSON.parse(data));
    }

    _getDeployedTemplate() {
      const StackName = S.getProject().getRegion(this.evt.options.stage, this.evt.options.region).getVariables().resourcesStackName;

      return S
        .getProvider('aws')
        .request('CloudFormation', 'getTemplate', {StackName}, this.evt.options.stage, this.evt.options.region)
        .then((reply) => JSON.parse(reply.TemplateBody));
    }
  }

  return ResourcesDiff;
};
