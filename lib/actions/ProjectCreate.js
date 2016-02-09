'use strict';

/**
 * Action: ProjectCreate
 * - Takes new project data from user and sets a new default "development" stage
 * - Validates the received data
 * - Generates scaffolding for the new project in CWD
 * - Creates a new project S3 bucket and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Generates project JSON files
 *
 * Options:
 * - name                 (String) a name for new project
 * - domain               (String) a domain for new project to create the bucket name with
 * - notificationEmail    (String) email to use for AWS alarms
 * - profile              (String) an AWS profile to create the project in. Must be available in ~/.aws/credentials
 * - region               (String) the first region for your new project
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require( path.join( serverlessPath, 'ServerlessError' ) ),
    SCli       = require( path.join( serverlessPath, 'utils/cli' ) ),
    SUtils     = require( path.join( serverlessPath, 'utils' ) ),
    os         = require('os'),
    fs         = require('fs'),
    BbPromise  = require('bluebird'),
    awsMisc    = require( path.join( serverlessPath, 'utils/aws/Misc' ) );

  BbPromise.promisifyAll(fs);

  /**
   * ProjectInstall Class
   */

  class ProjectCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + ProjectCreate.name;
    }

    registerActions() {
      this.S.addAction(this.createProject.bind(this), {
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
            option:      'domain',
            shortcut:    'd',
            description: 'Domain of your Serverless project'
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
            option:      'profile', // we need profile option for CLI API (non interactive)
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

      return this.S.actions.projectInit({
        options: {
          name:              evt.options.name,
          domain:            evt.options.domain,
          stage:             evt.options.stage,
          region:            evt.options.region,
          notificationEmail: evt.options.notificationEmail,
          profile:           evt.options.profile,
          noExeCf:           evt.options.noExeCf ? true : false
        }
      });
    }
  }

  return( ProjectCreate );
};