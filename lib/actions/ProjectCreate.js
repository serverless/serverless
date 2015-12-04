'use strict';

/**
 * Action: ProjectCreate
 */

const SPlugin    = require('../ServerlessPlugin'),
      SError     = require('../ServerlessError'),
      SCli       = require('../utils/cli'),
      SUtils     = require('../utils'),
      path       = require('path'),
      os         = require('os'),
      fs         = require('fs'),
      BbPromise  = require('bluebird'),
      awsMisc    = require('../utils/aws/Misc');

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
          option:      'stage',
          shortcut:    's',
          description: 'Stage for your new Serverless project',
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
          shortcut:    'rt',
          description: 'Optional - Lambda supported runtime. Default: nodejs',
        }, {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Optional - Don\'t execute CloudFormation, just generate it. Default: false'
        }, {
          option:      'nonInteractive',
          shortcut:    'ni',
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

    if(evt) {
      _this.evt = evt;
      _this.S._interactive = false;
    }
    
    // If CLI, parse arguments
    if (_this.S.cli) {
      _this.evt = this.S.cli.options;
      _this.S._awsProfile = this.evt.profile;
      
      if (_this.S.cli.options.nonInteractive) {
        _this.S._interactive = false;
      }
    }
    
    // Add default runtime
    if (!_this.evt.runtime) {  
      _this.evt.runtime = 'nodejs';
    }
    
    // Add default stage
    if (!_this.evt.stage) {  
      _this.evt.stage = 'dev';
    }
    

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
      .then(_this._initAWS)
      .then(_this._createProjectBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._createProjectJson)
      .then(function() {
        SCli.log('Successfully created project: ' + _this.evt.name);
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
    ['name', 'domain', 'notificationEmail', 'awsAdminKeyId', 'awsAdminSecretKey']
      .forEach(memberVarKey => {
        overrides[memberVarKey] = _this['evt'][memberVarKey];
      });

    let prompts = {
      properties: {
        name:              {
          description: 'Enter a project name: '.yellow,
          default:     'serverless-' + SUtils.generateShortId(19),
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
          message:     'Please enter a valid domain',
          required:    true,
          conform:     function(bucket) {
            let re = /^(?!:\/\/)([a-zA-Z0-9]+\.)?[a-zA-Z0-9][a-zA-Z0-9-]+\.[a-zA-Z]{2,15}?$/i;
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

    //Create aws credentials if DNE
    if (!SUtils.fileExistsSync(path.join(awsMisc.getConfigDir(), 'credentials'))) {
      prompts.properties.awsAdminKeyId = {
        description: 'Enter the ACCESS KEY ID for your Admin AWS IAM User: '.yellow,
        required:    true,
        message:     'Please enter a valid access key ID',
        conform:     function(key) {
          return (key) ? false : true;
        },
      };

      prompts.properties.awsAdminSecretKey = {
        description: 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: '.yellow,
        required:    true,
        message:     'Please enter a valid secret access key',
        conform:     function(key) {
          if (!key) return false;
          return true;
        },
      };
    }

    return this.promptInput(prompts, overrides)
      .then(function(answers) {
        _this.evt.name              = answers.name;
        _this.evt.domain            = answers.domain;
        _this.evt.notificationEmail = answers.notificationEmail;
        _this.evt.awsAdminKeyId     = answers.awsAdminKeyId;
        _this.evt.awsAdminSecretKey = answers.awsAdminSecretKey;

         
        if (!_this.evt.region) {
          // Prompt: region select
          let choices = awsMisc.validLambdaRegions.map(r => {
            return {
              key:   '',
              value: r,
              label: r,
            };
          });

          return _this.selectInput('Select a region for your project: ', choices, false)
            .then(results => {
              _this.evt.region = results[0].value;
            });
        }
      })
      .then(function() {

        // If profile exists, skip select prompt
        if (_this.S._awsProfile) {
          return;
        }

        // If aws credentials were passed, skip select prompt
        if (_this.S._awsAdminKeyId && _this.S._awsAdminSecretKey) {
          return;
        }

        // Prompt: profile select
        let profilesList = awsMisc.profilesMap(),
            profiles     = Object.keys(profilesList),
            choices      = [];

        for (let i = 0; i < profiles.length; i++) {
          choices.push({
            key:   '',
            value: profiles[i],
            label: profiles[i],
          });
        }

        return _this.selectInput('Select an AWS profile for your project: ', choices, false)
          .then(results => {
            _this.S._awsProfile = results[0].value;
          });
      });
  }

  /**
   * Validate all data from event, interactive CLI or non interactive CLI
   * and prepare project data
   */

  _validateAndPrepare() {
    
    // non interactive validation
    if (!this.S._interactive) {

      // Check API Keys
      if (!this.S._awsProfile) {
        if (!this.S._awsAdminKeyId || !this.S._awsAdminSecretKey) {
          return BbPromise.reject(new SError('Missing AWS Profile and/or API Key and/or AWS Secret Key'));
        }
      }
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
      this.evt.name = this.evt.name + '-' + SUtils.generateShortId(19);
    }
    
    // validate domain
    let domainRegex = /^(?!:\/\/)([a-zA-Z0-9]+\.)?[a-zA-Z0-9][a-zA-Z0-9-]+\.[a-zA-Z]{2,15}?$/i;
    if(!domainRegex.test(this.evt.domain)) {
      return BbPromise.reject(new SError('Please enter a valid domain'));
    }
    
    // Append unique id if domain is default
    if (this.evt.domain === 'myapp.com') {
      this.evt.domain = 'myapp-' + SUtils.generateShortId(8).toLowerCase() + '.com';
    }

    // validate email  
    let emailRegex = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
    if(!emailRegex.test(this.evt.notificationEmail)) {
      return BbPromise.reject(new SError('Please enter a valid email'));
    }
    
    // validate stage
    if(!SUtils.isStageNameValid(this.evt.stage)) {
      return BbPromise.reject(new SError('Stage must be letters and numbers only'));
    }
    
    // Validate: Ensure stage isn't "local"
    this.evt.stage = this.evt.stage.toLowerCase().replace(/\W+/g, '').substring(0, 15);
    if (this.evt.stage == 'local') {
      return BbPromise.reject(new SError('Stage ' + this.evt.stage + ' is reserved'));
    }
    
    // validate region
    if (awsMisc.validLambdaRegions.indexOf(this.evt.region) == -1) {
      return BbPromise.reject(new SError('Invalid region. Lambda not supported in ' + this.evt.region, SError.errorCodes.UNKNOWN));
    }
    
    // Set Serverless Regional Bucket
    this._projectBucket = SUtils.generateRegionBucketName(this.evt.region, this.evt.domain);

    // If no profile, create profile
    if (!this.S._awsProfile) {
      awsMisc.profilesSet('default', this.evt.region, this.S._awsAdminKeyId, this.S._awsAdminSecretKey);
      this.S._awsProfile = 'default';
    }

    return BbPromise.resolve();
  }

  /**
   * Create Project Directory
   */

  _createProjectDirectory() {
    let _this = this;

    _this._projectRootPath = path.resolve(path.join(path.dirname('.'), _this.evt.name));

    // Prepare admin.env
    let adminEnv = 'SERVERLESS_ADMIN_AWS_PROFILE=' + _this.S._awsProfile + os.EOL;

    // Prepare README.md
    let readme = '#' + _this.evt.name;

    // Create Project Scaffolding
    return SUtils.writeFile(
      path.join(_this._projectRootPath, '.env'),
        'SERVERLESS_STAGE=' + _this.evt.stage
        + '\nSERVERLESS_DATA_MODEL_STAGE=' + _this.evt.stage
      )
      .then(function() {
        
        return BbPromise.all([
          fs.mkdirSync(path.join(_this._projectRootPath, 'back')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back', 'tests')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back', 'lib')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back', 'modules')),
          SUtils.writeFile(path.join(_this._projectRootPath, 'admin.env'), adminEnv),
          SUtils.writeFile(path.join(_this._projectRootPath, 'README.md'), readme),
          SUtils.generateResourcesCf(
            _this._projectRootPath,
            _this.evt.name,
            _this.evt.domain,
            _this.evt.stage,
            _this.evt.region,
            _this.evt.notificationEmail
          ),
          fs.writeFileAsync(path.join(_this._projectRootPath, '.gitignore'), fs.readFileSync(path.join(_this._templatesDir, 'gitignore'))),
        ]);
      });
  }

  /**
   * Create serverless region bucket if it does not exist
   */

  _initAWS() {  
    let config = {
      profile: this.S._awsProfile,
      region : this.evt.region
    };

    this.S3  = require('../utils/aws/S3')(config);
    this.CF  = require('../utils/aws/CloudFormation')(config);
    BbPromise.resolve();
  }

  /**
   * Create serverless bucket if it does not exist
   */

  _createProjectBucket() {
    SCli.log('Creating a project region bucket on S3: ' + this._projectBucket + '...');
    return this.S3.sCreateBucket(this._projectBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in serverless stage/region bucket
   */

  _putEnvFile() {
    let stage = this.evt.stage;
    let envFileContents = `SERVERLESS_STAGE=${stage}
SERVERLESS_DATA_MODEL_STAGE=${stage}`;
    
    return this.S3.sPutEnvFile(
      this._projectBucket,
      this.evt.name,
      this.evt.stage,
      envFileContents);
  }

  /**
   * Put CF File
   */

  _putCfFile() {
    return this.CF.sPutCfFile(
      this._projectRootPath,
      this._projectBucket,
      this.evt.name,
      this.evt.stage,
      'resources');
  }

  /**
   * Create CloudFormation Stack
   */

  _createCfStack(cfTemplateURL) {
    let _this = this;

    if (_this.evt.noExeCf) {
      SUtils.sDebug('No execute CF was specified, skipping');

      let stackName = _this.CF.sGetResourcesStackName(_this.evt.stage, _this.evt.name);

      SCli.log(`Remember to run CloudFormation manually to create stack with name: ${stackName}`);
      SCli.log('After creating CF stack, remember to put the IAM role outputs and Serverless Bucket in your project s-project.json in the correct stage/region.');

      return BbPromise.resolve();
    }

    SCli.log('Creating CloudFormation Stack for your new project (~5 mins)...');

    // Start spinner
    _this._spinner = SCli.spinner();
    _this._spinner.start();

    // Create CF stack
    return _this.CF.sCreateResourcesStack(
      _this._projectRootPath,
      _this.evt.name,
      _this.evt.stage,
      _this.evt.domain,
      _this.evt.notificationEmail,
      cfTemplateURL
      )
      .then(cfData => {
        return _this.CF.sMonitorCf(cfData, 'create')
          .then(cfStackData => {
            _this._spinner.stop(true);
            return cfStackData;
          });
      });
  }

  /**
   * Create Project JSON
   */

  _createProjectJson(cfStackData) {

    let _this = this,
        iamRoleArnLambda;

    if (cfStackData) {
      for (let i = 0; i < cfStackData.Outputs.length; i++) {
        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
        }
      }
    }

    let prjJson = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 's-project.json'));

    prjJson.stages[_this.evt.stage] = [{
      region:               _this.evt.region,
      iamRoleArnLambda:     iamRoleArnLambda || '',
      regionBucket:        _this._projectBucket,
      apiFunctionAlias:     'LATEST',
    }];

    prjJson.name   = _this.evt.name;
    prjJson.domain = _this.evt.domain;

    fs.writeFileSync(path.join(_this._projectRootPath, 's-project.json'),
      JSON.stringify(prjJson, null, 2));

    return prjJson;
  }
}

module.exports = ProjectCreate;
