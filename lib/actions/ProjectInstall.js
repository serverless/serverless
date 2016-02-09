'use strict';

/**
 * Action: ProjectInstall
 * - Takes an existing project and sets a new default "development" stage
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
 * - stage                (String) the first stage for your new project
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require( path.join( serverlessPath, 'ServerlessError' ) ),
    SCli       = require( path.join( serverlessPath, 'utils/cli' ) ),
    SUtils     = require( path.join( serverlessPath, 'utils' ) ),
    os         = require('os'),
    fs         = require('fs'),
    fse        = require('fs-extra'),
    BbPromise  = require('bluebird'),
    awsMisc    = require( path.join( serverlessPath, 'utils/aws/Misc' ) );

  BbPromise.promisifyAll(fs);

  /**
   * ProjectInstall Class
   */

  class ProjectInstall extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + ProjectInstall.name;
    }

    registerActions() {
      this.S.addAction(this.installProject.bind(this), {
        handler:       'projectInstall',
        description:   'Installs an existing Serverless project',
        context:       'project',
        contextAction: 'install',
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
        ],
        parameters: [
          {
            parameter: 'project',
            description: 'The project you wish to install',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    installProject(evt) {

      let _this             = this;
      this.evt              = evt;

      // Validate: Check for project name
      if (!_this.evt.options.project) {
        return BbPromise.reject(new SError(`Please enter the name of the project you wish to install, like: serverless install project <projectname>`));
      }

      if (SUtils.dirExistsSync(path.join(process.cwd(), _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project))) {
        return BbPromise.reject(new SError(`folder ${_this.evt.options.name ? _this.evt.options.name : _this.evt.options.project} already exists in the current directory`));
      }

      /**
       * Control Flow
       */

      return BbPromise.try(function() {
          console.log('');
          SCli.log('Installing Serverless Project "' + _this.evt.options.project + '"...');
        })
        .bind(_this)
        .then(_this._installProject)
        .then(_this._initProject)
        .then(function() {

          SCli.log('Successfully installed project "'
            + _this.evt.options.project
            + '"');

          /**
           * Return EVT
           */

          return _this.evt;
        });
    }



    /**
     * Install Project
     */

    _installProject() {

      let _this = this;

      // Log
      SCli.log('Downloading project and installing dependencies...');

      // Start spinner
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return new BbPromise(function (resolve, reject) {

        // create temp package.json for npm install
        let packageJson = SUtils.readAndParseJsonSync(path.join(_this.S.config.serverlessPath, 'templates', 'nodejs', 'package.json'));
        fs.writeFileSync(path.join(process.cwd(), 'package.json'), JSON.stringify(packageJson, null, 2));

        let exec = require('child_process').exec,
          child;

        child = exec('npm install ' + _this.evt.options.project,
          function (error, stdout, stderr) {

            if (error !== null) return reject(new SError(error));

            try {
              fs.mkdirSync(path.join(process.cwd(), _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project));
              fse.copySync(path.join(process.cwd(), 'node_modules', _this.evt.options.project), path.join(process.cwd(), _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project));
            } catch (err) {
              return reject(new SError(err))
            }

            // Delete node_modules & package.json
            fse.removeSync(path.join(process.cwd(), 'node_modules'));
            fse.removeSync(path.join(process.cwd(), 'package.json'));


            return resolve();
          })
      })
        .then(function () {

          // Stop Spinner
          _this._spinner.stop(true);

        })
        .catch(function (e) {

          // Stop Spinner
          _this._spinner.stop(true);
          console.error(e);
          process.exit(1);
        });
    }

    /**
     * Init Project
     */

    _initProject() {

      let _this = this;

      // Update Global Serverless Instance
      if( !_this.S.hasProject() ) {
        let projectPath = path.resolve(path.join(path.dirname('.'), _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project));
        _this.S.setProject( new _this.S.classes.Project( projectPath ) );
      }

      // Load state again now that the project is set
      return _this.S.state.load()
        .then(function() {

          return _this.S.actions.projectInit({
            options: {
              name: _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project,
              domain: _this.evt.options.domain,
              stage: _this.evt.options.stage,
              region: _this.evt.options.region,
              notificationEmail: _this.evt.options.notificationEmail,
              profile: _this.evt.options.profile,
              noExeCf: _this.evt.options.noExeCf
            }
          });
        });
    }
  }

  return( ProjectInstall );
};