'use strict';

/**
 * Action: ProjectInstall
 * - Takes an existing project and sets a new default "dev" stage
 * - Validates the received data
 * - Generates scaffolding for the new project in CWD
 * - Creates a new project S3 bucket and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 * - Generates project JSON files
 *
 * Options:
 * - name                 (String) a name for new project
 * - bucket               (String) a bucket name for new project
 * - profile              (String) an AWS profile to create the project in. Must be available in ~/.aws/credentials
 * - region               (String) the first region for your new project
 * - stage                (String) the first stage for your new project
 * - noExeCf:             (Boolean) don't execute CloudFormation
 * - local                (String) a local path to the project to install instead of NPM
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require( path.join( serverlessPath, 'Error' ) ),
    SCli       = require( path.join( serverlessPath, 'utils/cli' ) ),
    BbPromise  = require('bluebird'),
    fse        = BbPromise.promisifyAll(require('fs-extra')),
    _          = require('lodash');
  let SUtils;

  /**
   * ProjectInstall Class
   */

  class ProjectInstall extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
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
            option:      'bucket',
            shortcut:    'b',
            description: 'The name of your project\'s bucket (domain url recommended)'
          }, {
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
      if (this.S.config.interactive) SCli.asciiGreeting();


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
        .then(_this._prompt)
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
     * Prompt
     */

    _prompt() {
      // Set temp name
      let name = this.evt.options.name || (this.evt.options.project + '-' + SUtils.generateShortId(6)).toLowerCase();

      // Skip if non-interactive
      if (!this.S.config.interactive) return BbPromise.resolve();

      // Values that exist will not be prompted
      let overrides = {
        name:              this.evt.options.name
      };

      let prompts = {
        properties: {
          name: {
            description: 'Enter a name for this project: '.yellow,
            default:     name,
            message:     'Name must be only letters, numbers or dashes',
            required:    true,
            conform:     (name) => {
              let re = /^[a-zA-Z0-9-_]+$/;

              // This hack updates the defaults in the other prompts
              if (re.test(name)) this.evt.options.name = name;

              return re.test(name);
            }
          }
        }
      };

      return this.cliPromptInput(prompts, overrides)
        .then((answers) => this.evt.options.name = answers.name);
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

    _installNpmProject() {
      let _this = this;

      return new BbPromise(function (resolve, reject) {

        // create temp package.json for npm install
        let packageJson = SUtils.readFileSync(path.join(_this.S.config.serverlessPath, 'templates', 'nodejs', 'package.json'));
        fse.writeFileSync(path.join(process.cwd(), 'package.json'), JSON.stringify(packageJson, null, 2));

        let exec = require('child_process').exec,
          child;

        child = exec('npm install ' + _this.evt.options.project,
          function (error, stdout, stderr) {

            if (error !== null) return reject(new SError(error));

            try {
              fse.mkdirSync(path.join(process.cwd(), _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project));
              fse.copySync(path.join(process.cwd(), 'node_modules', _this.evt.options.project), path.join(process.cwd(), _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project));
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

    _installLocalProject() {
      const pathToProjectTemplate = path.resolve(process.cwd(), this.evt.options.local),
            newFolderName         = this.evt.options.name || this.evt.options.project,
            pathToNewProject      = path.join(process.cwd(), newFolderName);

      return fse.copyAsync(pathToProjectTemplate, pathToNewProject);
    }

    /**
     * Init Project
     */

    _initProject() {

      let _this = this;

      return BbPromise.try(function(){
        // Update Global Serverless Instance
        if( !_this.S.hasProject() ) {
          let projectPath = path.resolve(path.join(path.dirname('.'), _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project));
          _this.S.updateConfig({ projectPath: projectPath});
          return _this.S.init();
        }
      })
      .then(function() {
        return _this.S.actions.projectInit({
          options: {
            name: _this.evt.options.name ? _this.evt.options.name : _this.evt.options.project,
            bucket: _this.evt.options.bucket,
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