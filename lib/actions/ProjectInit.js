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
 * - bucket               (String) a bucket name to create the bucket name with (domain recommended)
 * - profile              (String) an AWS profile to use for your first stage. Must be available in ~/.aws/credentials
 * - stage                (String) the first stage for your new project
 * - region               (String) the first region for your new project
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require( path.join( serverlessPath, 'Error' ) ),
    SCli       = require( path.join( serverlessPath, 'utils/cli' ) ),
    BbPromise  = require('bluebird'),
    os         = require('os'),
    fs         = BbPromise.promisifyAll(require('fs'));
  let SUtils;

  class ProjectInit extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
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

          return this.evt;
        });
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this,
        name, isName;

      // fixes the double generated bucket id bug
      if (_this.evt.options.name) isName = true;

      // Set temp name
      if (_this.S.hasProject()) {
        name = _this.evt.options.name ? _this.evt.options.name : (_this.S.getProject().getName() + '-' + SUtils.generateShortId(6)).toLowerCase();
      } else {
        name = _this.evt.options.name ? _this.evt.options.name : ('serverless-' + SUtils.generateShortId(6)).toLowerCase();
      }

      // Skip if non-interactive
      if (!_this.S.config.interactive) return BbPromise.resolve();

      // Values that exist will not be prompted
      let overrides = {
        name:              _this.evt.options.name,
        bucket:            _this.evt.options.bucket,
        region:            _this.evt.options.region
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
          bucket:            {
            description: 'Enter a unique project bucket name (using a domain is recommended): '.yellow,
            default:     isName ? (name + '-' + SUtils.generateShortId(6)).toLowerCase() + '.com' : name + '.com',
            message:     'Bucket name must only contain lowercase letters, numbers, periods and dashes',
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

          // Set Prompt Values
          _this.evt.options.name              = answers.name;
          _this.evt.options.bucket            = answers.bucket;

          // Skip if region option exists
          if (_this.evt.options.region) return;

          // Select Prompt: Project Bucket region
          let choices = _this.S.getProvider().validRegions.map(r => {
            return {
              key:   '',
              value: r,
              label: r
            };
          });

          return _this.cliPromptSelect('Pick the primary region for your project: ', choices, false)
            .then(results => {
              _this.evt.options.region = results[0].value;
            });
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

      // Validate bucket
      let bucketRegex = /^[a-z0-9-.]+$/;
      if(!bucketRegex.test(this.evt.options.bucket)) {
        return BbPromise.reject(new SError('bucket must only contain lowercase letters, numbers, periods and dashes'));
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

          // If no project exists, set it
          if( !_this.S.hasProject() ) {
            _this.S.updateConfig({
              projectPath: path.resolve(path.join(path.dirname('.'), _this.evt.options.name))
            });
            _this.S.setProject(new _this.S.classes.Project(_this.S));
          }

          // Fill in project attributes
          _this.project          = _this.S.getProject();
          _this.project.name     = _this.evt.options.name;

          // Add default project variables
          _this.project.addVariables({
            project:             _this.evt.options.name,
            projectBucket:       _this.evt.options.bucket,
            projectBucketRegion: _this.evt.options.region
          });


          // Save Project
          return _this.project.save()
            .then(function() {
              return _this.project.load();
            });
        })
        .then(function() {

          // Create other scaffolding

          // If package.json does not exist, save it
          let packageJson;
          if (!SUtils.fileExistsSync(_this.project.getRootPath( 'package.json' ))) {

            // Prepare new package.json
            packageJson               = SUtils.readFileSync(path.join(_this.S.config.serverlessPath, 'templates', 'nodejs', 'package.json'));
            packageJson.name          = _this.project.getName();
            packageJson.description   = 'A Serverless Project and its Serverless Plugin dependencies.';
            packageJson.private       = false;
            packageJson.dependencies  = {};
            if (packageJson.devDependencies) delete packageJson.devDependencies;
            if (packageJson.keywords)        delete packageJson.keywords;
            files.push(fs.writeFileAsync(_this.project.getRootPath( 'package.json' ), JSON.stringify(packageJson, null, 2)))

          } else {

            // Modify existing package.json
            packageJson       = SUtils.readFileSync(_this.project.getRootPath( 'package.json' ));
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
            files.push(fs.writeFileAsync(_this.project.getRootPath( 'package.json' ), JSON.stringify(packageJson, null, 2)))

          }

          // If README.md does not exist, save it
          if (!SUtils.fileExistsSync(_this.project.getRootPath( 'README.md' ))) {
            let readme = '#' + _this.project.name;
            files.push(fs.writeFileAsync(_this.project.getRootPath( 'README.md' ), readme));
          }

          // If .gitignore does not exist, save it
          if (!SUtils.fileExistsSync(_this.project.getRootPath( '.gitignore' ))) {
            files.push(fs.writeFileAsync(_this.project.getRootPath( '.gitignore' ), fs.readFileSync(path.join(_this.S.config.serverlessPath, 'templates', 'gitignore'))));
          }

          // If .env does not exist, save it
          if (!SUtils.fileExistsSync(_this.project.getRootPath( '.env' ))) {
            files.push(SUtils.writeFile(
              _this.project.getRootPath( '.env' ),
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
          profile:  this.evt.options.profile,
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