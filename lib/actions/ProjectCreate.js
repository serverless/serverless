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
   * ProjectCreate Class
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
            description: 'Name of your new Serverless project'
          }, {
            option:      'domain',
            shortcut:    'd',
            description: 'Domain of your new Serverless project'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Lambda supported region'
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
          }, {
            option:      'nonInteractive',
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    createProject(options) {

      let _this          = this;
      this.options       = options || {};
      this._templatesDir = path.join(__dirname, '..', 'templates');

      // If CLI, parse arguments
      if (this.S.cli) {
        this.options = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (this.S.cli.options.nonInteractive) this.S._interactive = false;
      }

      // Create Project instance
      this.project                        = new this.S.classes.Project(this.S);
      this.project.data.name              = this.options.name || this.project.data.name;
      this.project.data.notificationEmail = this.options.notificationEmail || this.project.data.notificationEmail;

      // Check for AWS Profiles
      let profilesList = awsMisc.profilesMap();
      this.profiles    = Object.keys(profilesList);

      /**
       * Control Flow
       */

      return BbPromise.try(function() {
          if (_this.S._interactive) SCli.asciiGreeting();
        })
        .bind(_this)
        .then(_this._prompt)
        .then(_this._validateAndPrepare)
        .then(_this._createProjectBucket)
        .then(_this._createProjectScaffolding)
        .then(_this._createStageAndRegion)
        .then(_this._deployResources)
        .then(function() {

          SCli.log('Successfully created project: ' + _this.project.data.name);

          // Return Project
          return _this.project;
        });
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this;

      // Skip if non-interactive
      if (!_this.S._interactive) return BbPromise.resolve();

      // Values that exist will not be prompted
      let overrides = {
        name: null,
        domain: _this.options.domain,
        notificationEmail: _this.options.notificationEmail,
        awsAdminKeyId: _this.options.awsAdminKeyId,
        awsAdminSecretKey: _this.options.awsAdminSecretKey
      };

      let prompts = {
        properties: {
          name:              {
            description: 'Enter a project name: '.yellow,
            default:     _this.project.data.name,
            message:     'Name must be only letters, numbers or dashes',
            required:    true,
            conform:     function(name) {
              let re = /^[a-zA-Z0-9-_]+$/;

              // This hack updates the defaults in the other prompts
              if (re.test(name)) _this.project.data.name = name;

              return re.test(name);
            }
          },
          domain:            {
            description: 'Enter a project domain (used for serverless regional bucket names): '.yellow,
            default:     _this.project.data.name.toLowerCase() + '.com',
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
            default:     'me@' + _this.project.data.name.toLowerCase() + '.com',
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
          _this.S._awsAdminKeyId          = answers.awsAdminKeyId;
          _this.S._awsAdminSecretKey      = answers.awsAdminSecretKey;
          _this.project.data.name         = answers.name;
          _this.options.domain            = answers.domain;
          _this.options.notificationEmail = answers.notificationEmail;

          // Show region prompt
          if (!_this.options.region) {

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
                _this.options.region = results[0].value;
              });
          }
        })
        .then(function() {

          // If profile exists, skip select prompt
          if (_this.profile) return;

          // If aws credentials were passed, skip select prompt
          if (_this.S._awsAdminKeyId && _this.S._awsAdminSecretKey) return;

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
              _this.profile = results[0].value;
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
      if (this.profile) {
        this.S._awsAdminKeyId     = this.AwsMisc.profilesGet(this.profile)[this.profile].aws_access_key_id;
        this.S._awsAdminSecretKey = this.AwsMisc.profilesGet(this.profile)[this.profile].aws_secret_access_key;
      }

      // Validate API Keys
      if (!this.S._awsAdminKeyId || !this.S._awsAdminSecretKey) {
        return BbPromise.reject(new SError('Missing AWS API Key and/or AWS Secret Key'));
      }

      // Initialize Other AWS Services
      let awsConfig = {
        region:          this.options.region,
        accessKeyId:     this.S._awsAdminKeyId,
        secretAccessKey: this.S._awsAdminSecretKey
      };
      this.S3 = require('../utils/aws/S3')(awsConfig);
      this.CF = require('../utils/aws/CloudFormation')(awsConfig);

      // Validate Name - AWS only allows Alphanumeric and - in name
      let nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.project.data.name);
      if (!nameOk) {
        return BbPromise.reject(new SError('Project names can only be alphanumeric and -'));
      }

      // Validate Domain
      let domainRegex = /^[a-z0-9-.]+$/;
      if(!domainRegex.test(this.options.domain)) {
        return BbPromise.reject(new SError('Domain must only contain lowercase letters, numbers, periods and dashes'));
      }

      // Validate NotificationEmail
      let emailRegex = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
      if(!emailRegex.test(this.options.notificationEmail)) {
        return BbPromise.reject(new SError('Please enter a valid email'));
      }

      // Validate Region
      if (awsMisc.validLambdaRegions.indexOf(this.options.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.options.region, SError.errorCodes.UNKNOWN));
      }

      return BbPromise.resolve();
    }

    /**
     * Create Project Bucket
     */

    _createProjectBucket() {

      // Set Serverless Project Bucket
      this.projectBucket = SUtils.generateProjectBucketName(this.options.domain);

      SCli.log('Creating your project bucket on S3: ' + this.projectBucket + '...');

      return this.S3.sCreateBucket(this.projectBucket);
    }

    /**
     * Create Project Scaffolding
     */

    _createProjectScaffolding() {

      let _this = this;

      // Create project root directory
      _this.S._projectRootPath = path.resolve(path.join(path.dirname('.'), _this.project.data.name));

      // Prepare admin.env
      let adminEnv = 'SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID=' + _this.S._awsAdminKeyId + os.EOL
        + 'SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY=' + _this.S._awsAdminSecretKey + os.EOL;

      // Prepare README.md
      let readme = '#' + _this.project.data.name;

      // Create Project Scaffolding
      return SUtils.writeFile(
        path.join(_this.S._projectRootPath, 'back', '.env'),
          'SERVERLESS_STAGE=development'
          + '\nSERVERLESS_DATA_MODEL_STAGE=development'
          + '\nSERVERLESS_PROJECT_NAME=' + _this.project.data.name
        )
        .then(function() {

          // Create Folders
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'back', 'modules'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'meta'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'meta', 'private'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'meta', 'public'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'meta', 'private', 'variables'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'meta', 'public', 'variables'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'meta', 'private', 'resources'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'plugins'));
          fs.mkdirSync(path.join(_this.S._projectRootPath, 'plugins', 'custom'));

          return BbPromise.all([
            SUtils.writeFile(path.join(_this.S._projectRootPath, 'admin.env'), adminEnv),
            SUtils.writeFile(path.join(_this.S._projectRootPath, 'README.md'), readme),
            fs.writeFileAsync(path.join(_this.S._projectRootPath, '.gitignore'), fs.readFileSync(path.join(_this._templatesDir, 'gitignore')))
          ]);
        })
        .then(function() {

          // Save project
          _this.project.save();

          // Create meta, fill in defaults and save
          _this.meta = new _this.S.classes.Meta(_this.S);
          _this.meta.data.public.variables.project            = _this.project.data.name;
          _this.meta.data.private.variables.project           = _this.project.data.name;
          _this.meta.data.private.variables.projectBucket     = _this.projectBucket;
          _this.meta.data.private.variables.domain            = _this.options.domain;
          _this.meta.data.private.variables.notificationEmail = _this.options.notificationEmail;
          _this.meta.save();

        });
    }

    /**
     * Create Stage And Region
     */

    _createStageAndRegion() {

      let options = {
        stage: 'development',
        region: this.options.region,
        subaction: true
      };

      return this.S.actions.stageCreate(options);
    }

    /**
     * Deploy Resources to Stage/Region
     */

    _deployResources() {

      let options = {
        stage: 'development',
        region: this.options.region,
        noExeCf: this.options.noExeCf,
        subaction: true
      };

      return this.S.actions.resourcesDeploy(options);
    }
  }

  return( ProjectCreate );
};
