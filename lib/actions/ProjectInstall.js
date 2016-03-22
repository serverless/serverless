'use strict';

/**
 * Action: ProjectInstall
 * - Takes an existing project and sets a new default "dev" stage
 * - Validates the received data
 * - Generates scaffolding for the new project in CWD
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Generates project JSON files
 *
 * Options:
 * - profile              (String) an AWS profile to create the project in. Must be available in ~/.aws/credentials
 * - region               (String) the first region for your new project
 * - stage                (String) the first stage for your new project
 * - noExeCf:             (Boolean) don't execute CloudFormation
 * - local                (String) a local path to the project to install instead of NPM
 */

module.exports = function(S) {

  const path     = require('path'),
      SUtils     = S.utils,
      SError     = require(S.getServerlessPath('Error')),
      SCli       = require(S.getServerlessPath('utils/cli')),
      BbPromise  = require('bluebird'),
      fse        = BbPromise.promisifyAll(require('fs-extra')),
      _          = require('lodash');

  /**
   * ProjectInstall Class
   */

  class ProjectInstall extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.installProject.bind(this), {
        handler:       'projectInstall',
        description:   'Installs an existing Serverless project',
        context:       'project',
        contextAction: 'install',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Initial project stage'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Initial Lambda supported AWS region'
          }, {
            option:      'profile',
            shortcut:    'p',
            description: 'AWS profile that is set in your aws config file'
          }, {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false'
          }, {
            option:      'local',
            shortcut:    'l',
            description: 'A local path to the project to install instead of NPM'
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

      // Greet
      if (S.config.interactive) SCli.asciiGreeting();

      let _this             = this;
      this.evt              = evt;

      // Validate: Check for project name
      if (!_this.evt.options.project) {
        return BbPromise.reject(new SError(`Please enter the name of the project you wish to install, like: serverless install project <projectname>`));
      }

      if (SUtils.dirExistsSync(path.join(process.cwd(), _this.evt.options.project))) {
        return BbPromise.reject(new SError(`Folder ${_this.evt.options.project} already exists in the current directory`));
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

      // Log
      SCli.log('Downloading project and installing dependencies...');

      // Start spinner
      this._spinner = SCli.spinner();
      this._spinner.start();

      const installPromise = this.evt.options.local ? this._installLocalProject() : this._installNpmProject();

      return installPromise
          .bind(this)
          .then(() => this._spinner.stop(true))
          .catch((e) => {
            // Stop Spinner
            this._spinner.stop(true);
            console.error(e);
            process.exit(1);
          });
    }

    /**
     * Install NPM Project
     */

    _installNpmProject() {
      let _this = this;

      return new BbPromise(function (resolve, reject) {

        // create temp package.json for npm install
        let packageJson = SUtils.readFileSync(path.join(S.config.serverlessPath, 'templates', 'nodejs', 'package.json'));
        fse.writeFileSync(path.join(process.cwd(), 'package.json'), JSON.stringify(packageJson, null, 2));

        let exec = require('child_process').exec,
            child;

        child = exec('npm install ' + _this.evt.options.project,
            function (error, stdout, stderr) {

              if (error !== null) return reject(new SError(error));

              try {
                fse.mkdirSync(path.join(process.cwd(), _this.evt.options.project));
                fse.copySync(path.join(process.cwd(), 'node_modules', _this.evt.options.project), path.join(process.cwd(), _this.evt.options.project));
              } catch (err) {
                return reject(new SError(err))
              }

              // Delete node_modules & package.json
              fse.removeSync(path.join(process.cwd(), 'node_modules'));
              fse.removeSync(path.join(process.cwd(), 'package.json'));

              return resolve();
            })
      });
    }

    /**
     * Install local Project
     */

    _installLocalProject() {
      const pathToProjectTemplate = path.resolve(process.cwd(), this.evt.options.local),
          newFolderName           = this.evt.options.project,
          pathToNewProject        = path.join(process.cwd(), newFolderName);

      return fse.copyAsync(pathToProjectTemplate, pathToNewProject);
    }

    /**
     * Init Project
     */

    _initProject() {

      let _this = this;

      return BbPromise.try(function(){
            // Update Global Serverless Instance
            if( !S.hasProject() ) {
              let projectPath = path.resolve(path.join(path.dirname('.'), _this.evt.options.project));
              S.updateConfig({ projectPath: projectPath});
              return S.init();
            }
          })
          .then(function() {
            return S.actions.projectInit({
              options: {
                name: _this.evt.options.project,
                stage: _this.evt.options.stage,
                region: _this.evt.options.region,
                profile: _this.evt.options.profile,
                noExeCf: _this.evt.options.noExeCf,
                noGreeting: true
              }
            });
          });
    }
  }

  return( ProjectInstall );
};