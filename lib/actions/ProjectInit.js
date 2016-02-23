'use strict';

/**
 * Action: ProjectInit
 * - Takes a project and initializes it
 * - Creates a _meta folder
 * - Creates a new project S3 bucket and puts env and CF files
 * - Creates CF stack by default, unless noExeCf option is set to true
 *
 * Options:
 * - name                 (String) a new name for this project
 * - domain               (String) a domain for new project to create the bucket name with
 * - profile              (String) an AWS profile to create the project in. Must be available in ~/.aws/credentials
 * - stage                (String) the first stage for your new project
 * - region               (String) the first region for your new project
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
      SError     = require( path.join( serverlessPath, 'Error' ) ),
      SCli       = require( path.join( serverlessPath, 'utils/cli' ) ),
      SUtils     = require( path.join( serverlessPath, 'utils' ) ),
      BbPromise  = require('bluebird'),
      os         = require('os'),
      fs         = BbPromise.promisifyAll(require('fs'));


  /**
   * ProjectInit Class
   */

  class ProjectInit extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + ProjectInit.name;
    }

    registerActions() {
      this.S.addAction(this.projectInit.bind(this), {
        handler:       'projectInit',
        description:   'Initializes a Serverless project',
        context:       'project',
        contextAction: 'init',
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

    projectInit(evt) {

      this.evt         = evt;

      // Check for AWS Profiles
      let profilesList = this.S.getProvider('aws').getAllProfiles();
      this.profiles    = Object.keys(profilesList);

      // Set Stage default
      if (!this.evt.options.stage) this.evt.options.stage = 'dev';

      // Greet
      if (this.S.config.interactive && !this.evt.options.noGreeting) SCli.asciiGreeting();

      console.log('');
      SCli.log('Initializing Serverless Project...');

      /**
       * Control Flow
       */

      return this._prompt()
          .bind(this)
          .then(this._validateAndPrepare)
          .then(this._scaffold)
          .then(this._createStageAndRegion)
          .then(this._installComponentDeps)
          .then(() => {
            SCli.log(`Successfully initialized project "${this.evt.options.name}"`);

            /**
             * Return EVT
             */

            return this.evt;
          });
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this,
          name, isName;

      // fixes the double generated domain id bug
      if (_this.evt.options.name) isName = true;

      // Check if project exists
      if (_this.S.hasProject()) {
        // Set temp name
        name = _this.evt.options.name ? _this.evt.options.name : (_this.S.getProject().getName() + '-' + SUtils.generateShortId(6)).toLowerCase();
      } else {
        // Set temp name
        name = _this.evt.options.name ? _this.evt.options.name : ('serverless-' + SUtils.generateShortId(6)).toLowerCase();
      }

      // Skip if non-interactive
      if (!_this.S.config.interactive) return BbPromise.resolve();

      // Values that exist will not be prompted
      let overrides = {
        name:              _this.evt.options.name,
        domain:            _this.evt.options.domain
      };

      let prompts = {
        properties: {
          name:              {
            description: 'Enter a name for this project: '.yellow,
            default:     name,
            message:     'Name must be only letters, numbers or dashes',
            required:    true,
            conform:     function(name) {
              let re = /^[a-zA-Z0-9-_]+$/;

              // This hack updates the defaults in the other prompts
              if (re.test(name)) _this.evt.options.name = name;

              return re.test(name);
            }
          },
          domain:            {
            description: 'Enter a universally unique project bucket name: '.yellow,
            default:     isName ? (name + '-' + SUtils.generateShortId(6)).toLowerCase() + '.com' : name,
            message:     'Domain must only contain lowercase letters, numbers, periods and dashes',
            required:    true,
            conform:     function(bucket) {
              let re = /^[a-z0-9-.]+$/;
              return re.test(bucket);
            }
          }
        }
      };

      return this.cliPromptInput(prompts, overrides)
          .then(function(answers) {

            // Set prompt values
            _this.evt.options.name              = answers.name;
            _this.evt.options.domain            = answers.domain;

          });
    }

    /**
     * Validate & Prepare
     * - Validate all data from event, interactive CLI or non interactive CLI and prepare project data
     */

    _validateAndPrepare() {

      // Validate Name - AWS only allows Alphanumeric and - in name
      let nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.evt.options.name);
      if (!nameOk) {
        return BbPromise.reject(new SError('Project names can only be alphanumeric and -'));
      }

      // Validate Domain
      let domainRegex = /^[a-z0-9-.]+$/;
      if(!domainRegex.test(this.evt.options.domain)) {
        return BbPromise.reject(new SError('Domain must only contain lowercase letters, numbers, periods and dashes'));
      }

      return BbPromise.resolve();
    }

    /**
     * Update Scaffolding
     */

    _scaffold() {

      let _this = this;
      let files = [];

      return BbPromise.try(function() {

            // Update Global Serverless Instance
            if( !_this.S.hasProject() ) {
              _this.S.updateConfig({
                projectPath: path.resolve(path.join(path.dirname('.'), _this.evt.options.name))
              });
              return _this.S.setProject(new _this.S.classes.Project(_this.S));
            }

          })
          .then(function() {

            // Fill in project attributes
            _this.project = _this.S.getProject();
            _this.project.name = _this.evt.options.name;

            let projectVariables = _this.project.getVariables();
            projectVariables.fromObject({
              project:       _this.evt.options.name,
              projectBucket: SUtils.generateProjectBucketName(_this.evt.options.domain, _this.evt.options.region),
              domain:        _this.evt.options.domain
            });

            // Create s-resources-cf.json
            if (!_this.project.cloudFormation && // In case initializing older project w/ cloudFormation property
                !SUtils.fileExistsSync( _this.project.getFilePath( 's-resources-cf.json' ))) {
              files.push(
                  SUtils.writeFile(
                      _this.project.getFilePath(  's-resources-cf.json' ),
                      JSON.stringify(
                          SUtils.readAndParseJsonSync(path.join(_this.S.config.serverlessPath, 'templates', 's-resources-cf.json')),
                          null, 2)
                  ));
            }

            // Save State
            return _this.S.state.save()
                .then(function() {
                  return _this.S.state.load();
                });
          })
          .then(function() {

            // Create other scaffolding

            // If admin.env does not exist, save it
            if (!SUtils.fileExistsSync(_this.project.getFilePath( 'admin.env' ))) {
              let adminEnv = 'SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID=' + _this.S.config.awsAdminKeyId + os.EOL
                  + 'SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY=' + _this.S.config.awsAdminSecretKey + os.EOL;
              files.push(fs.writeFileAsync(_this.project.getFilePath( 'admin.env' ), adminEnv));
            }

            // If package.json does not exist, save it
            let packageJson;
            if (!SUtils.fileExistsSync(_this.project.getFilePath( 'package.json' ))) {

              // Prepare new package.json
              packageJson               = SUtils.readAndParseJsonSync(path.join(_this.S.config.serverlessPath, 'templates', 'nodejs', 'package.json'));
              packageJson.name          = _this.project.getName();
              packageJson.description   = 'A Serverless Project and its Serverless Plugin dependencies.';
              packageJson.private       = false;
              packageJson.dependencies  = {};
              if (packageJson.devDependencies) delete packageJson.devDependencies;
              if (packageJson.keywords)        delete packageJson.keywords;
              files.push(fs.writeFileAsync(_this.project.getFilePath( 'package.json' ), JSON.stringify(packageJson, null, 2)))

            } else {

              // Modify existing package.json
              packageJson       = SUtils.readAndParseJsonSync(_this.project.getFilePath( 'package.json' ));
              packageJson.name  = _this.project.getName();

              // Delete unnecessary package.json properties, if they exist
              if (packageJson.readme)  delete packageJson.readme;
              if (packageJson.readmeFilename)  delete packageJson.readmeFilename;
              if (packageJson.gitHead)  delete packageJson.gitHead;
              if (packageJson._id)  delete packageJson._id;
              if (packageJson._shasum)  delete packageJson._shasum;
              if (packageJson._from)  delete packageJson._from;
              if (packageJson._npmVersion)  delete packageJson._npmVersion;
              if (packageJson._nodeVersion)  delete packageJson._nodeVersion;
              if (packageJson._npmUser)  delete packageJson._npmUser;
              if (packageJson.dist)  delete packageJson.dist;
              if (packageJson.maintainers)  delete packageJson.maintainers;
              if (packageJson.directories)  delete packageJson.directories;
              if (packageJson._resolved)  delete packageJson._resolved;
              if (packageJson._args)  delete packageJson._args;
              if (packageJson._inCache)  delete packageJson._inCache;
              if (packageJson._installable)  delete packageJson._installable;
              if (packageJson._location)  delete packageJson._location;
              if (packageJson._phantomChildren)  delete packageJson._phantomChildren;
              if (packageJson._requested)  delete packageJson._requested;
              if (packageJson._requiredBy)  delete packageJson._requiredBy;
              if (packageJson._shrinkwrap || packageJson._shrinkwrap === null)  delete packageJson._shrinkwrap;
              if (packageJson._spec)  delete packageJson._spec;
              if (packageJson._where)  delete packageJson._where;
              files.push(fs.writeFileAsync(_this.project.getFilePath( 'package.json' ), JSON.stringify(packageJson, null, 2)))

            }

            // If README.md does not exist, save it
            if (!SUtils.fileExistsSync(_this.project.getFilePath( 'README.md' ))) {
              let readme = '#' + _this.project.name;
              files.push(fs.writeFileAsync(_this.project.getFilePath( 'README.md' ), readme));
            }

            // If .gitignore does not exist, save it
            if (!SUtils.fileExistsSync(_this.project.getFilePath( '.gitignore' ))) {
              files.push(fs.writeFileAsync(_this.project.getFilePath( '.gitignore' ), fs.readFileSync(path.join(_this.S.config.serverlessPath, 'templates', 'gitignore'))));
            }

            // If .env does not exist, save it
            if (!SUtils.fileExistsSync(_this.project.getFilePath( '.env' ))) {
              files.push(SUtils.writeFile(
                  _this.project.getFilePath( '.env' ),
                  'SERVERLESS_STAGE=' + _this.evt.options.stage
                  + '\nSERVERLESS_DATA_MODEL_STAGE=' + _this.evt.options.stage
                  + '\nSERVERLESS_PROJECT_NAME=' + _this.project.name
              ));
            }

            return BbPromise.all(files);
          });
    }

    /**
     * Create Stage And Region
     */

    _createStageAndRegion() {
      return this.S.actions.stageCreate({
        options: {
          stage:   this.evt.options.stage,
          region:  this.evt.options.region,
          noExeCf: this.evt.options.noExeCf ? true : false
        }
      });
    }

    /**
     * Create Stage And Region
     */

    _installComponentDeps() {

      let _this    = this,
          components = _this.S.getProject().getAllComponents();

      return BbPromise.all(
          components.map(function (component) {
            SCli.log(`Installing ${component.runtime} dependencies for component: ${component.name}...`);
            component.getRuntime().installDepedencies( component.name ); //TODO: shouldnt we use component sPath, in case it is a subfolder?
          }),
          { concurrency: 1 }
      );
    }
  }

  return( ProjectInit );
};