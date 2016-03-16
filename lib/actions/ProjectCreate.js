'use strict';

/**
 * Action: ProjectCreate
 * - Takes new project data from user and sets a new default "dev" stage
 * - Validates the received data
 * - Generates scaffolding for the new project in CWD
 * - Creates a CF template
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Generates project JSON files
 *
 * Options:
 * - name                 (String) a name for new project
 * - profile              (String) an AWS profile to create the project in. Must be available in ~/.aws/credentials
 * - region               (String) the first region for your new project
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

let SUtils;

module.exports = function(S) {

  const SUtils = S.utils,
    BbPromise  = require('bluebird');

  class ProjectCreate extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.createProject.bind(this), {
        handler:       'projectCreate',
        description:   'Creates scaffolding for a new Serverless project',
        context:       'project',
        contextAction: 'create',
        options:       [
          {
            option:      'name',
            shortcut:    'n',
            description: 'A new name for this Serverless project'
          }, {
            option:      'stage',
            shortcut:    's',
            description: 'Initial project stage'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Initial Lambda supported AWS region'
          }, {
            option:      'notificationEmail',
            shortcut:    'e',
            description: 'email to use for AWS alarms'
          }, {
            option:      'profile',
            shortcut:    'p',
            description: 'AWS profile that is set in your aws config file'
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

    createProject(evt) {

      return S.actions.projectInit({
        options: {
          name:              evt.options.name,
          stage:             evt.options.stage,
          region:            evt.options.region,
          profile:           evt.options.profile,
          noExeCf:           evt.options.noExeCf ? true : false
        }
      });
    }
  }

  return( ProjectCreate );
};