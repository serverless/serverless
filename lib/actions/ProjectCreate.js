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
 * Event Properties:
 * - name                 (String) a name for new project
 * - domain               (String) a domain for new project to create the bucket name with
 * - notificationEmail    (String) email to use for AWS alarms
 * - profile              (String) an AWS profile to create the project in. Must be available in ~/.aws/credentials
 * - region               (String) the first region for your new project
 * - runtime:             (String) optional runtime for your new project. Default is nodejs
 * - noExeCf:             (Boolean) Don't execute CloudFormation
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
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
      this._templatesDir = path.join(__dirname, '..', 'templates');
      this.evt = {};
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
            description: 'Name of your new Serverless project',
          }, {
            option:      'domain',
            shortcut:    'd',
            description: 'Domain of your new Serverless project',
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Lambda supported region',
          }, {
            option:      'notificationEmail',
            shortcut:    'e',
            description: 'email to use for AWS alarms',
          }, {
            option:      'profile', // we need profile option for CLI API (non interactive)
            shortcut:    'p',
            description: 'AWS profile that is set in your aws config file',
          }, {
            option:      'runtime',
            shortcut:    't',
            description: 'Optional - Lambda supported runtime. Default: nodejs',
          }, {
            option:      'noExeCf',
            shortcut:    'c',
            description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false'
          }, {
            option:      'nonInteractive',
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          },
        ],
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    createProject(evt) {

      let _this = this;

      if (evt) {
        _this.evt = evt;
        _this.S._interactive = false;
      }

      // If CLI, parse arguments
      if (_this.S.cli) {
        _this.evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

        if (_this.S.cli.options.nonInteractive) _this.S._interactive = false;
      }

      // Add default runtime
      if (!_this.evt.runtime) _this.evt.runtime = 'nodejs';

      // Always create "development" stage on ProjectCreate
      _this.evt.stage = 'development';

      // Check for AWS Profiles
      let profilesList    = awsMisc.profilesMap();
      _this.evt.profiles  = Object.keys(profilesList);

      /**
       * Control Flow
       */

      return BbPromise.try(function() {
            if (_this.S._interactive) {
              SCli.asciiGreeting();
            }
          })
          .bind(_this)
          .then(_this._prompt)
          .then(_this._validateAndPrepare)
          .then(_this._createProjectDirectory)
          .then(_this._createProjectBucket)
          .then(_this._createProjectJson)
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

      let _this     = this,
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
            default:     'serverless' + SUtils.generateShortId(19),
            message:     'Name must be only letters, numbers or dashes',
            required:    true,
            conform:     function(name) {
              let re = /^[a-zA-Z0-9-_]+$/;
              return re.test(name);
            },
          },
          domain:            {
            description: 'Enter a project domain (used for serverless regional bucket names): '.yellow,
            default:     'myapp.com',
            message:     'Domain must only contain lowercase letters, numbers, periods and dashes',
            required:    true,
            conform:     function(bucket) {
              let re = /^[a-z0-9-.]+$/;
              return re.test(bucket);
            },
          },
          notificationEmail: {
            description: 'Enter an email to use for AWS alarms: '.yellow,
            required:    true,
            message:     'Please enter a valid email',
            default:     'me@myapp.com',
            conform:     function(email) {
              let re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
              return re.test(email);
            },
          },
        }
      };

      if (!_this.evt.profiles || !_this.evt.profiles.length) {
        prompts.properties.awsAdminKeyId = {
          description: 'Enter the ACCESS KEY ID for your Admin AWS IAM User: '.yellow,
          required:    true,
          message:     'Please enter a valid access key ID',
          conform:     function(key) {
            return (key) ? true : false;
          },
        };

        prompts.properties.awsAdminSecretKey = {
          description: 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: '.yellow,
          required:    true,
          message:     'Please enter a valid secret access key',
          conform:     function(key) {
            return (key) ? true : false;
          },
        };
      }

      return this.cliPromptInput(prompts, overrides)
          .then(function(answers) {
            _this.evt.name               = answers.name;
            _this.evt.domain             = answers.domain;
            _this.evt.notificationEmail  = answers.notificationEmail;
            _this.S._awsAdminKeyId       = answers.awsAdminKeyId;
            _this.S._awsAdminSecretKey   = answers.awsAdminSecretKey;

            if (!_this.evt.region) {
              // Prompt: region select
              let choices = awsMisc.validLambdaRegions.map(r => {
                return {
                  key:   '',
                  value: r,
                  label: r,
                };
              });

              return _this.cliPromptSelect('Select a region for your project: ', choices, false)
                  .then(results => {
                    _this.evt.region = results[0].value;
                  });
            }
          })
          .then(function() {

            // If profile exists, skip select prompt
            if (_this.evt.profile) return;

            // If aws credentials were passed, skip select prompt
            if (_this.S._awsAdminKeyId && _this.S._awsAdminSecretKey) return;

            // Prompt: profile select
            let choices = [];
            for (let i = 0; i < _this.evt.profiles.length; i++) {
              choices.push({
                key:   '',
                value: _this.evt.profiles[i],
                label: _this.evt.profiles[i]
              });
            }

            return _this.cliPromptSelect('Select an AWS profile for your project: ', choices, false)
                .then(results => {
                  _this.evt.profile = results[0].value;
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
      if (this.evt.profile) {
        this.S._awsAdminKeyId     = this.AwsMisc.profilesGet(this.evt.profile)[this.evt.profile].aws_access_key_id;
        this.S._awsAdminSecretKey = this.AwsMisc.profilesGet(this.evt.profile)[this.evt.profile].aws_secret_access_key;
      }

      // Initialize Other AWS Services
      let awsConfig = {
        region:          this.evt.region,
        accessKeyId:     this.S._awsAdminKeyId,
        secretAccessKey: this.S._awsAdminSecretKey,
      };
      this.S3  = require('../utils/aws/S3')(awsConfig);
      this.CF  = require('../utils/aws/CloudFormation')(awsConfig);

      // Non interactive validation
      if (!this.S._interactive) {
        // Check Params
        if (!this.evt.name || !this.evt.stage || !this.evt.region || !this.evt.domain || !this.evt.notificationEmail) {
          return BbPromise.reject(new SError('Missing required properties'));
        }
      }

      // Validate: AWS only allows Alphanumeric and - in name
      let nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.evt.name);
      if (!nameOk) {
        return BbPromise.reject(new SError('Project names can only be alphanumeric and -'));
      }

      // Append unique id if name is in use
      if (SUtils.dirExistsSync(path.join(process.cwd(), this.evt.name))) {
        let oldName = this.evt.name;
        this.evt.name = this.evt.name + SUtils.generateShortId(19);
        SCli.log(`Folder ${oldName} already exists, changing project name to ${this.evt.name}`);
      }

      // Validate domain
      let domainRegex = /^[a-z0-9-.]+$/;
      if(!domainRegex.test(this.evt.domain)) {
        return BbPromise.reject(new SError('Domain must only contain lowercase letters, numbers, periods and dashes'));
      }

      // Append unique id if domain is default
      if (this.evt.domain === 'myapp.com') {
        this.evt.domain = 'myapp-' + SUtils.generateShortId(8).toLowerCase() + '.com';
      }

      // Validate email
      let emailRegex = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
      if(!emailRegex.test(this.evt.notificationEmail)) {
        return BbPromise.reject(new SError('Please enter a valid email'));
      }

      // Validate region
      if (awsMisc.validLambdaRegions.indexOf(this.evt.region) == -1) {
        return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.evt.region, SError.errorCodes.UNKNOWN));
      }

      // Validate API Keys
      if (!this.S._awsAdminKeyId || !this.S._awsAdminSecretKey) {
        return BbPromise.reject(new SError('Missing AWS API Key and/or AWS Secret Key'));
      }

      // Set Serverless Regional Bucket
      this.evt.projectBucket = SUtils.generateProjectBucketName(this.evt.region, this.evt.domain);

      // Set Global Meta
      this.S._meta = {
        private: {
          stages:    {},
          variables: {
            domain:        this.evt.domain,
            projectBucket: this.evt.projectBucket
          }
        },
        public: {
          variables: {}
        }
      };

      return BbPromise.resolve();
    }

    /**
     * Create Project Directory
     */

    _createProjectDirectory() {

      let _this = this;

      _this.S._projectRootPath = path.resolve(path.join(path.dirname('.'), _this.evt.name));

      // Prepare admin.env
      let adminEnv = 'SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID=' + _this.S._awsAdminKeyId + os.EOL
          + 'SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY=' + _this.S._awsAdminSecretKey + os.EOL;

      // Prepare README.md
      let readme = '#' + _this.evt.name;

      // Create Project Scaffolding
      return SUtils.writeFile(
          path.join(_this.S._projectRootPath, 'back', '.env'),
              'SERVERLESS_STAGE=' + _this.evt.stage
              + '\nSERVERLESS_DATA_MODEL_STAGE=' + _this.evt.stage
              + '\nSERVERLESS_PROJECT_NAME=' + _this.evt.name
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
              fs.writeFileAsync(path.join(_this.S._projectRootPath, '.gitignore'), fs.readFileSync(path.join(_this._templatesDir, 'gitignore'))),
            ]);
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
     * Create Project JSON
     */

    _createProjectJson() {

      let _this = this;

      //TODO: Move to RegionCreate
      //if (cfStackData) {
      //  for (let i = 0; i < cfStackData.Outputs.length; i++) {
      //    if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
      //      _this.evt.iamRoleLambdaArn = cfStackData.Outputs[i].OutputValue;
      //    }
      //  }
      //
      //  // Save StackName to Evt
      //  _this.evt.stageCfStack = cfStackData.StackName;
      //}

      // Create s-project.json
      let prjJson          = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 's-project.json'));
      prjJson.name         = _this.evt.name;
      prjJson.description  = 'A brand new Serverless project';
      prjJson.cloudFormation.Description = _this.evt.name + ' resources';

      fs.writeFileSync(path.join(_this.S._projectRootPath, 's-project.json'),
          JSON.stringify(prjJson, null, 2));

      // Save Meta
      SUtils.saveMeta(_this.S._projectRootPath, _this.S._meta);
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
