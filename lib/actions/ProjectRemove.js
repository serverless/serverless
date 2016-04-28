'use strict';

/**
 * Action: ProjectRemove
 * - Removes a project.
 *
 * Options:
 * - stage                (String) the name of the new stage
 */

module.exports = function(S) {

  const path   = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird'),
    fs         = BbPromise.promisifyAll(require('fs'));

  /**
   * ProjectRemove Class
   */

  class ProjectRemove extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.projectRemove.bind(this), {
        handler:       'projectRemove',
        description:   'Removes a project. Usage: serverless project remove',
        context:       'project',
        contextAction: 'remove',
        options:       [
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

    projectRemove(evt) {
      this.evt    = evt;

      SCli.log(`Removing project...`);

      // Flow
      return this._removeAllStages()
        .then(() => {
          let projectName = S.getProject().getName();

          // Status
          SCli.log(`Successfully removed project "${projectName}"`);

          this.evt.data.project = projectName;

          /**
           * Return EVT
           */

          return this.evt;
        });
    }


    /**
     * Remove Stages
     * - Call StageRemove Action for each stage of the project
     */

    _removeAllStages() {
      let stages = S.getProject().getAllStages();

      return BbPromise.each(stages, (stage) => {
        let evt = {
          options: {
            stage:   stage.name,
            noExeCf: !!this.evt.options.noExeCf
          }
        };
        return S.actions.stageRemove(evt);
      });
    }
  }

  return ProjectRemove;
};
