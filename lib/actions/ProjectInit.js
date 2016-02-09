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
    fse        = require('fs-extra'),
    BbPromise  = require('bluebird'),
    awsMisc    = require( path.join( serverlessPath, 'utils/aws/Misc' ) );

  BbPromise.promisifyAll(fs);

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

    projectInit(evt) {

      let _this        = this;
      this.evt         = evt;

      // Check for AWS Profiles
      let profilesList = awsMisc.profilesMap();
      this.profiles    = Object.keys(profilesList);

      // Set Stage default
      if (!_this.evt.options.stage) _this.evt.options.stage = 'dev';

      // Greet
      if (_this.S.config.interactive) SCli.asciiGreeting();

      /**
       * Control Flow
       */

      return BbPromise.try(function() {
          console.log('');
          SCli.log('Initializing Serverless Project...');
        })
        .bind(_this)
        .then(_this._prompt)
        .then(_this._validateAndPrepare)
        .then(_this._scaffold)
        .then(_this._createStageAndRegion)
        .then(_this._installComponentDeps)
        .then(function() {

          SCli.log('Successfully initialized project "'
            + _this.evt.options.name
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

      let _this = this,
        name, isName;

      // fixes the double generated domain id bug
      if (_this.evt.options.name) isName = true;

      // Check if project exists
      if (_this.S.getProject()) {
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
        domain:            _this.evt.options.domain,
        notificationEmail: _this.evt.options.notificationEmail,
        awsAdminKeyId:     _this.evt.options.awsAdminKeyId,
        awsAdminSecretKey: _this.evt.options.awsAdminSecretKey
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
          },
          notificationEmail: {
            description: 'Enter an email to use for AWS alarms: '.yellow,
            required:    true,
            message:     'Please enter a valid email',
            default:     'me@' + name + '.com',
            conform:     function(email) {
              let re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
              return re.test(email);
            }
          }
        }
      };

      if (!_this.profiles || !_this.profiles.length) {

        prompts.properties.awsAdminKeyId = {
          description: 'Enter the ACCESS KEY ID for your Admin AWS IAM User: '.yellow,
          required:    true,
          message:     'Please enter a valid access key ID',
          conform:     function(key) {
            return (key) ? true : false;
          }
        };

        prompts.properties.awsAdminSecretKey = {
          description: 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: '.yellow,
          required:    true,
          message:     'Please enter a valid secret access key',
          conform:     function(key) {
            return (key) ? true : false;
          }
        };
      }

      return this.cliPromptInput(prompts, overrides)
        .then(function(answers) {

          // Set prompt values
          _this.S.config.awsAdminKeyId        = answers.awsAdminKeyId;
          _this.S.config.awsAdminSecretKey    = answers.awsAdminSecretKey;
          _this.evt.options.name              = answers.name;
          _this.evt.options.domain            = answers.domain;
          _this.evt.options.notificationEmail = answers.notificationEmail;

          // Show region prompt
          if (!_this.evt.options.region) {

            // Prompt: region select
            let choices = awsMisc.validLambdaRegions.map(r => {
              return {
                key:   '',
                value: r,
                label: r
              };
            });

            return _this.cliPromptSelect('Select a region for your project: ', choices, false)
              .then(results => {
                _this.evt.options.region = results[0].value;
              });
          }
        })
        .then(function() {

          // If profile exists, skip select prompt
          if (_this.evt.options.profile) return;

          // If aws credentials were passed, skip select prompt
          if (_this.S.config.awsAdminKeyId && _this.S.config.awsAdminSecretKey) return;

          // Prompt: profile select
          let choices = [];
          for (let i = 0; i < _this.profiles.length; i++) {
            choices.push({
              key:   '',
              value: _this.profiles[i],
              label: _this.profiles[i]
            });
          }

          return _this.cliPromptSelect('Select an AWS profile for your project: ', choices, false)
            .then(results => {
              _this.evt.options.profile = results[0].value;
            });
        });
    }

    /**
     * Validate & Prepare
     * - Validate all data from event, interactive CLI or non interactive CLI and prepare project data
     */

    _validateAndPrepare() {

      // Initialize AWS Misc Service
      this.AwsMisc = require('../utils/aws/Misc');

      // If Profile, extract API Keys
      if (this.evt.options.profile) {
        this.S.config.awsAdminKeyId     = this.AwsMisc.profilesGet(this.evt.options.profile)[this.evt.options.profile].aws_access_key_id;
        this.S.config.awsAdminSecretKey = this.AwsMisc.profilesGet(this.evt.options.profile)[this.evt.options.profile].aws_secret_access_key;
      }

      // Validate API Keys
      if (!this.S.config.awsAdminKeyId || !this.S.config.awsAdminSecretKey) {
        return BbPromise.reject(new SError('Missing AWS API Key and/or AWS Secret Key'));
      }

      // Initialize Other AWS Services
      let awsConfig = {
        region:          this.evt.options.region,
        accessKeyId:     this.S.config.awsAdminKeyId,
        secretAccessKey: this.S.config.awsAdminSecretKey
      };
      this.S3 = require('../utils/aws/S3')(awsConfig);
      this.CF = require('../utils/aws/CloudFormation')(awsConfig);

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

      // Validate NotificationEmail
      let emailRegex = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
      if(!emailRegex.test(this.evt.options.notificationEmail)) {
        return BbPromise.reject(new SError('Please enter a valid email'));
      }

      // Validate Region
      if (awsMisc.validLambdaRegions.indexOf(this.evt.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.evt.options.region, SError.errorCodes.UNKNOWN));
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
            let projectPath = path.resolve(path.join(path.dirname('.'), _this.evt.options.name));
            _this.S.setProject( new _this.S.classes.Project( projectPath ) );
          }

          // Fill in meta attributes
          _this.meta = _this.S.state.getMeta();
          _this.meta.variables.project = _this.evt.options.name;
          _this.meta.variables.projectBucket = SUtils.generateProjectBucketName(_this.evt.options.domain, _this.evt.options.region);
          _this.meta.variables.domain = _this.evt.options.domain;
          _this.meta.variables.notificationEmail = _this.evt.options.notificationEmail;

          // Fill in project attributes
          _this.project = _this.S.getProject();
          _this.project.name = _this.evt.options.name;

          // Create s-resources-cf.json
          if (!_this.project.cloudFormation && // In case initializing older project w/ cloudFormation property
            !SUtils.fileExistsSync( _.this.project.getFilePath( 's-resources-cf.json' ))) {
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
        components = _this.S.state.getComponents();

      return BbPromise.try(function() {

        components.forEach(function (component) {
          SCli.log(`Installing ${component.runtime} dependencies for component: ${component.name}...`);
          if (component.runtime === 'nodejs') {
            SUtils.npmInstall(_this.S.getProject().getFilePath( component.name ));
          } else if (component.runtime === 'python2.7') {
            SUtils.pipPrefixInstall(
              _this.S.getProject().getFilePath( component.name, 'requirements.txt' ),
              _this.S.getProject().getFilePath( component.name, 'vendored' )
            );
          }
          return BbPromise.resolve();

        });
      })
    }
  }

  return( ProjectInit );
};