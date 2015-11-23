'use strict';

/**
 * Action: ProjectCreate
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      os         = require('os'),
      fs         = require('fs'),
      BbPromise  = require('bluebird'),
      awsMisc    = require('../../utils/aws/Misc'),
      JawsUtils  = require('../../utils');

BbPromise.promisifyAll(fs);

/**
 * ProjectCreate Class
 */

class ProjectCreate extends JawsPlugin {

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  static getName() {
    return 'jaws.core.' + ProjectCreate.name;
  }

  registerActions() {
    this.Jaws.addAction(this.createProject.bind(this), {
      handler:       'projectCreate',
      description:   'Creates scaffolding for a new JAWS project',
      context:       'project',
      contextAction: 'create',
      options:       [
        {
          option:      'name',
          shortcut:    'n',
          description: 'Name of your new JAWS project',
        }, {
          option:      'domain',
          shortcut:    'd',
          description: 'Domain of your new JAWS project',
        }, {
          option:      'stage',
          shortcut:    's',
          description: '',
        }, {
          option:      'region',
          shortcut:    'r',
          description: '',
        }, {
          option:      'notificationEmail',
          shortcut:    'e',
          description: '',
        }, {
          option:      'runtime',
          shortcut:    'r',
          description: '',
        }, {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Don\'t execute CloudFormation, just generate it'
        },
      ],
    });
    return BbPromise.resolve();
  }

  /**
   * Create Project
   */

  createProject(evt) {
    let _this           = this;
    _this.evt           = evt;
    _this._templatesDir = path.join(__dirname, '..', '..', 'templates');

    /**
     * Control Flow
     */

    return BbPromise.try(function() {
        if (_this.Jaws._interactive) {
          JawsCLI.asciiGreeting();
        }
      })
      .bind(_this)
      .then(_this._validateAndPrepare)
      .then(_this._prompt)
      .then(_this._prepareProjectData)
      .then(_this._createProjectDirectory)
      .then(_this._initAWS)
      .then(_this._createProjectBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._createProjectJson)
      .then(function() {
        JawsCLI.log('Successfully created project: ' + _this.evt.name);
      });
  }
  
  /**
   * Validate and Prepare
   */

  _validateAndPrepare() {

    let _this = this;

    // If CLI, parse arguments
    if (_this.Jaws.cli) {
      _this.evt = _this.Jaws.cli.options;
    }

    // If NO-CLI, validate
    if (!_this.Jaws.cli) {

      // Check API Keys
      if (!this.Jaws._awsProfile) {
        if (!_this.Jaws._awsAdminKeyId || !_this.Jaws._awsAdminSecretKey) {
          return BbPromise.reject(new JawsError('Missing AWS API Key and/or AWS Secret Key'));
        }
      }
      // Check Params
      if (!_this.evt.name || !_this.evt.stage || !_this.evt.region || !_this.evt.domain || !_this.evt.notificationEmail) {
        return BbPromise.reject(new JawsError('Missing required properties'));
      }
      
      _this.evt.stage = _this.evt.stage.toLowerCase().replace(/\W+/g, '').substring(0, 15);
    }

    if (!_this.evt.runtime) {
      // Add default runtime
      _this.evt.runtime = 'nodejs';
    }

    return BbPromise.resolve();
  }

  /**
   * Prompt
   */

  _prompt() {

    let _this     = this,
        overrides = {};

    // Skip if non-interactive
    if (!_this.Jaws._interactive) return BbPromise.resolve();

    //Setup overrides based off of member var values
    ['name', 'domain', 'notificationEmail', 'stage', 'awsAdminKeyId', 'awsAdminSecretKey']
      .forEach(memberVarKey => {
        overrides[memberVarKey] = _this['evt'][memberVarKey];
      });

    let prompts = {
      properties: {
        name:              {
          description: 'Enter a project name: '.yellow,
          default:     'jaws-' + JawsUtils.generateShortId(19),
          message:     'Name must be only letters, numbers or dashes',
          required:    true,
          conform:     function(name) {
            let re = /^[a-zA-Z0-9-_]+$/;
            return re.test(name);
          },
        },
        domain:            {
          description: 'Enter a project domain (used for jaws s3 bucket name): '.yellow,
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
            return (!email) ? false : true;
          },
        },
        stage:             {
          description: 'Enter a stage name for this project: '.yellow,
          required:    true,
          default:     'dev',
          message:     'Stage must be letters and numbers only',
          conform:     function(stage) {
            return JawsUtils.isStageNameValid(stage);
          },
        },
      }
    };

    //Create aws credentials if DNE
    if (!JawsUtils.fileExistsSync(path.join(awsMisc.getConfigDir(), 'credentials'))) {
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
        _this.evt.stage             = answers.stage.toLowerCase();
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
        if (_this._awsProfile) {
          return;
        }

        // If aws credentials were passed, skip select prompt
        if (_this._awsAdminKeyId && _this._awsAdminSecretKey) {
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
            _this._awsProfile = results[0].value;
          });
      });
  }

  /**
   * Prepare Project Data
   */

  _prepareProjectData() {

    let _this = this;

    // Validate: Ensure stage isn't "local"
    if (_this.evt.stage.toLowerCase() == 'local') {
      return BbPromise.reject(new JawsError('Stage ' + _this.evt.stage + ' is reserved'));
    }

    // Validate: AWS only allows Alphanumeric and - in name
    let nameOk = /^([a-zA-Z0-9-]+)$/.exec(_this.evt.name);
    if (!nameOk) {
      return BbPromise.reject(new JawsError('Project names can only be alphanumeric and -'));
    }

    // Append unique id if name is in use
    if (JawsUtils.dirExistsSync(path.join(process.cwd(), _this.evt.name))) {
      _this.evt.name = _this.evt.name + '-' + JawsUtils.generateShortId(19);
    }

    // Append unique id if domain is default
    if (_this.evt.domain === 'myapp.com') {
      _this.evt.domain = 'myapp-' + JawsUtils.generateShortId(8).toLowerCase() + '.com';
    }

    if (!/[a-z0-9-.]/.test(_this.evt.domain)) {
      return BbPromise.reject(new JawsError('Domain must contain only lowercase letters, numbers, periods (.), and dashes (-)'));
    }

    // Set JAWS Bucket
    _this._projectBucket = JawsUtils.generateRegionBucketName(_this.evt.region, _this.evt.domain);

    // If no profile, ensure access keys, create profile
    if (!_this._awsProfile) {
      awsMisc.profilesSet('default', _this.evt.region, _this.Jaws._awsAdminKeyId, _this.Jaws._awsAdminSecretKey);
      _this._awsProfile = 'default';
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
    let adminEnv = 'JAWS_ADMIN_AWS_PROFILE=' + _this._awsProfile + os.EOL;

    // Prepare README.md
    let readme = '#' + _this.evt.name;

    // Create Project Scaffolding
    return JawsUtils.writeFile(
      path.join(_this._projectRootPath, '.env'),
        'JAWS_STAGE=' + _this.evt.stage
        + '\nJAWS_DATA_MODEL_STAGE=' + _this.evt.stage
      )
      .then(function() {
        return BbPromise.all([
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back', 'tests')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back', 'lib')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back', 'slss_modules')),
          JawsUtils.writeFile(path.join(_this._projectRootPath, 'admin.env'), adminEnv),
          JawsUtils.writeFile(path.join(_this._projectRootPath, 'README.md'), readme),
          JawsUtils.generateResourcesCf(
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
   * Create jaws bucket if it does not exist
   */

  _initAWS() {  
    let config = {
      profile: this._awsProfile, 
      region : this.evt.region
    };

    this.S3  = require('../../utils/aws/S3')(config);
    this.CF  = require('../../utils/aws/CloudFormation')(config);
    BbPromise.resolve();
  }

  /**
   * Create jaws bucket if it does not exist
   */

  _createProjectBucket() {
    let _this = this;
    JawsCLI.log('Creating a project region bucket on S3: ' + _this._projectBucket + '...');
    return _this.S3.sCreateBucket(_this._projectBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in JAWS stage/region bucket
   */

  _putEnvFile() {
    let stage = this.evt.stage;
    let envFileContents = `JAWS_STAGE=${stage}
JAWS_DATA_MODEL_STAGE=${stage}`;
    
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
      JawsUtils.jawsDebug('No execute CF was specified, skipping');

      let stackName = this.CF.sGetResourcesStackName(this.evt.stage, this.evt.name);

      JawsCLI.log(`Remember to run CloudFormation manually to create stack with name: ${stackName}`);
      JawsCLI.log('After creating CF stack, remember to put the IAM role outputs and jawsBucket in your project jaws.json in the correct stage/region.');

      return BbPromise.resolve();
    }

    JawsCLI.log('Creating CloudFormation Stack for your new project (~5 mins)...');

    // Start spinner
    _this._spinner = JawsCLI.spinner();
    _this._spinner.start();

    // Create CF stack
    return this.CF.sCreateResourcesStack(
      _this._projectRootPath,
      _this.evt.name,
      _this.evt.stage,
      _this.evt.domain,
      _this.evt.notificationEmail,
      cfTemplateURL
      )
      .then(cfData => {
        return this.CF.sMonitorCf(cfData, 'create')
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

    let prjJson = JawsUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'jaws.json'));

    prjJson.stages[_this.evt.stage] = [{
      region:               _this.evt.region,
      iamRoleArnLambda:     iamRoleArnLambda || '',
      projectBucket:        _this._projectBucket,
      apiFunctionAlias:     'LATEST',
    }];

    prjJson.name   = _this.evt.name;
    prjJson.domain = _this.evt.domain;

    fs.writeFileSync(path.join(_this._projectRootPath, 'jaws.json'),
      JSON.stringify(prjJson, null, 2));

    return prjJson;
  }
}

module.exports = ProjectCreate;
