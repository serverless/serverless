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
            option:      'runtime',
            shortcut:    't',
            description: 'Optional - Lambda supported runtime. Default: nodejs'
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

      let _this    = this;
      this.options = options || {};

      // If CLI, parse arguments
      if (this.S.cli) {
        this.options = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (this.S.cli.options.nonInteractive) this.S._interactive = false;
      }

      // Create Project instance
      this.project                        = new this.S.classes.Project();
      this.project.data.name              = this.options.name || this.project.data.name;
      this.project.data.domain            = this.options.domain || this.project.data.domain;
      this.project.data.notificationEmail = this.options.notificationEmail || this.project.data.notificationEmail;

      // Create Meta instance
      this.meta                               = new this.S.classes.Meta();
      this.meta.data.private.variables.domain = this.project.data.name + '.com';
      this.meta.data.private.variables.notificationEmail = 'me@' + this.project.data.name + '.com';

      // Always create "development" stage on ProjectCreate
      this.meta.data.private.stages.development = {
        regions: {},
        variables: {}
      };

      // If region, set it
      if (this.options.region) {
        this.meta.data.private.stages.development.regions[this.options.region] = {
          variables: {}
        }
      }

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
        .then(_this._createProjectScaffolding)
        .then(_this._createProjectBucket)
        .then(_this._createStageAndRegion)
        .then(function() {
          SCli.log('Successfully created project: ' + _this.evt.name);
          // Return Event
          return _this.evt;
        });
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this   = this,
        overrides = {};

      // Skip if non-interactive
      if (!_this.S._interactive) return BbPromise.resolve();

      //Setup overrides based off of member var values
      ['name', 'domain', 'notificationEmail', 'awsAdminKeyId', 'awsAdminSecretKey'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this['evt'][memberVarKey];
      });

      let prompts = {
        properties: {
          name:              {
            description: 'Enter a project name: '.yellow,
            default:     this.project.data.name,
            message:     'Name must be only letters, numbers or dashes',
            required:    true,
            conform:     function(name) {
              let re = /^[a-zA-Z0-9-_]+$/;
              return re.test(name);
            }
          },
          domain:            {
            description: 'Enter a project domain (used for serverless regional bucket names): '.yellow,
            default:     this.meta.data.private.variables.domain,
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
            default:     this.meta.data.private.variables.notificationEmail,
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

          _this.S._awsAdminKeyId              = answers.awsAdminKeyId;
          _this.S._awsAdminSecretKey          = answers.awsAdminSecretKey;
          _this.project.data.name             = answers.name;
          _this.meta.private.variables.domain = answers.domain;
          _this.meta.private.variables.notificationEmail = answers.notificationEmail;

          if (!Object.keys(_this.meta.data.private.stages.development.regions).length) {

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

                _this.meta.data.private.stages.development.regions[results[0].value] = {
                  variables: {}
                };
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
     * Validate all data from event, interactive CLI or non interactive CLI
     * and prepare project data
     */

    _validateAndPrepare() {

      // Initialize AWS Misc Service
      this.AwsMisc = require('../utils/aws/Misc');

      // If Profile, extract API Keys
      if (this.profile) {
        this.S._awsAdminKeyId     = this.AwsMisc.profilesGet(this.profile)[this.profile].aws_access_key_id;
        this.S._awsAdminSecretKey = this.AwsMisc.profilesGet(this.profile)[this.profile].aws_secret_access_key;
      }

      // Set Serverless Project Bucket
      this.meta.data.private.variables.projectBucket = SUtils.generateProjectBucketName(
        Object.keys(this.meta.data.private.stages.development.regions)[0],
        this.meta.data.private.variables.domain);

      // Validate Project via .validate()

      // Validate Meta via .validate()

      // Validate API Keys
      if (!this.S._awsAdminKeyId || !this.S._awsAdminSecretKey) {
        return BbPromise.reject(new SError('Missing AWS API Key and/or AWS Secret Key'));
      }

      // Initialize Other AWS Services
      let awsConfig = {
        region:          Object.keys(this.meta.data.private.stages.development.regions)[0],
        accessKeyId:     this.S._awsAdminKeyId,
        secretAccessKey: this.S._awsAdminSecretKey
      };
      this.S3 = require('../utils/aws/S3')(awsConfig);
      this.CF = require('../utils/aws/CloudFormation')(awsConfig);

      return BbPromise.resolve();
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
          'SERVERLESS_STAGE=' + Object.keys(_this.meta.data.private.stages)[0]
          + '\nSERVERLESS_DATA_MODEL_STAGE=' + Object.keys(_this.meta.data.private.stages)[0]
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

          // TODO: Use Project.save() and Meta.save()

        });
    }

    /**
     * Create Serverless Project Bucket
     */

    _createProjectBucket() {
      SCli.log('Creating a project region bucket on S3: ' + this.evt.projectBucket + '...');
      return this.S3.sCreateBucket(this.evt.projectBucket);
    }

    /**
     * Create Stage And Region
     */

    _createStageAndRegion() {

      let _this = this;

      let newEvent = {
        stage: 'development',
        region: _this.evt.region,
        _subaction: true
      };

      return _this.S.actions.stageCreate(newEvent);
    }
  }

  return( ProjectCreate );
};
