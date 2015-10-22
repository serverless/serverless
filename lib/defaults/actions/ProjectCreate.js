'use strict';

/**
 * Action: ProjectCreate
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      os         = require('os'),
      BbPromise  = require('bluebird'),
      AWSUtils   = require('../../utils/aws'),
      JawsUtils  = require('../../utils');

let fs = require('fs');
BbPromise.promisifyAll(fs);

/**
 * ProjectCreate Class
 */

class ProjectCreate extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
    this._templatesDir = path.join(__dirname, '..', '..', 'templates');
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + ProjectCreate.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.createProject.bind(this), {
      handler:       'projectCreate',
      description:   'Creates scaffolding for a new JAWS project',
      context:       'project',
      contextAction: 'create',
      options:       [
        {
          option:      'name',
          shortcut:    'n',
          description: 'Name of your new JAWS project'
        }, {
          option:      'domain',
          shortcut:    'd',
          description: 'Domain of your new JAWS project'
        }, {
          option:      'stage',
          shortcut:    's',
          description: ''
        }, {
          option:      'region',
          shortcut:    'r',
          description: ''
        }, {
          option:      'notificationEmail',
          shortcut:    'e',
          description: ''
        }, {
          option:      'runtime',
          shortcut:    'r',
          description: ''
        }, {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Don\'t execute CloudFormation, just generate it'
        }
      ],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param name
   * @param domain
   * @param stage
   * @param region
   * @param notificationEmail
   * @param runtime
   * @param noCf
   * @returns {Promise}
   */
  createProject(name, domain, stage, region, notificationEmail, runtime, noCf) {

    let _this = this;
    /**
     * Non-Interactive Validations
     */

    if (!_this.Jaws._interactive && !this.Jaws._awsProfile) {
      // Check API Keys
      if (!_this.Jaws._awsAdminKeyId || !_this.Jaws._awsAdminSecretKey) {
        throw new JawsError('Missing AWS API Key and/or AWS Secret Key');
      }

      // Check Params
      if (!name || !stage || !region || !domain || !notificationEmail) {
        throw new JawsError('Missing required properties');
      }
    }

    /**
     * Defaults
     */

    _this._name = name || null;
    _this._domain            = domain || null;
    _this._stage             = stage ? stage.toLowerCase().replace(/\W+/g, '').substring(0, 15) : null;
    _this._notificationEmail = notificationEmail;
    _this._region            = region;
    _this._runtime           = runtime || 'nodejs';
    _this._noCf              = noCf;

    // Interactive Defaults
    if (_this.Jaws._interactive) {
      _this._prompts          = {
        properties: {},
      };
      _this.Prompter          = JawsCLI.prompt();
      _this.Prompter.override = {};
      _this._spinner          = null;
    }

    /**
     * Control Flow
     */

    return BbPromise.try(function() {
        if (_this.Jaws._interactive) {
          JawsCLI.asciiGreeting();
        }
      })
      .bind(_this)
      .then(_this._prompt)
      .then(_this._prepareProjectData)
      .then(_this._createProjectDirectory)
      .then(_this._createJawsBucket)
      .then(_this._putEnvFile)
      .then(_this._putCfFile)
      .then(_this._createCfStack)
      .then(_this._createProjectJson);
  }

  /**
   * Prompt
   * @returns {Promise}
   * @private
   */

  _prompt() {
    let _this     = this,
        overrides = {};

    //Setup overrides based off of member var values
    ['name', 'domain', 'notificationEmail', 'stage', 'awsAdminKeyId', 'awsAdminSecretKey']
      .forEach(memberVarKey => {
        overrides[memberVarKey] = _this['_' + memberVarKey];
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
          message:     'Stage must be letters only',
          conform:     function(stage) {
            let re = /^[a-zA-Z]+$/;
            return re.test(stage);
          },
        },
      }
    };

    //Create aws credentials if DNE
    if (!JawsUtils.fileExistsSync(path.join(AWSUtils.getConfigDir(), 'credentials'))) {
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
        _this._name              = answers.name;
        _this._domain = answers.domain;
        _this._stage  = answers.stage.toLowerCase();
        _this._notificationEmail = answers.notificationEmail;
        _this._awsAdminKeyId     = answers.awsAdminKeyId;
        _this._awsAdminSecretKey = answers.awsAdminSecretKey;

        // If region exists, skip select prompt
        if (_this._region) {
          return;
        }

        // Prompt: region select
        let choices = [];
        AWSUtils.validLambdaRegions.forEach(function(r) {
          choices.push({
            key:   '',
            value: r,
            label: r,
          });
        });

        return _this.selectInput('Select a region for your project: ', choices, false)
          .then(results => {
            _this._region = results[0].value;
          });
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
        let profilesList = AWSUtils.profilesMap(),
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
   * @returns {Promise}
   * @private
   */

  _prepareProjectData() {

    let _this = this;

    // Validate: Ensure stage isn't "local"
    if (_this._stage.toLowerCase() == 'local') {
      throw new JawsError('Stage ' + _this._stage + ' is reserved');
    }

    // Validate: AWS only allows Alphanumeric and - in name
    let nameOk = /^([a-zA-Z0-9-]+)$/.exec(_this._name);
    if (!nameOk) {
      throw new JawsError('Project names can only be alphanumeric and -');
    }

    // Append unique id if name is in use
    if (JawsUtils.dirExistsSync(path.join(process.cwd(), _this._name))) {
      _this._name = _this._name + '-' + JawsUtils.generateShortId(19);
    }

    // Append unique id if domain is default
    if (_this._domain === 'myapp.com') {
      _this._domain = 'myapp-' + JawsUtils.generateShortId(8) + '.com';
    }

    // Set JAWS Bucket
    _this._jawsBucket = JawsUtils.generateJawsBucketName(_this._stage, _this._region, _this._domain);

    // If no profile, ensure access keys, create profile
    if (!_this._awsProfile) {
      AWSUtils.profilesSet('default', _this._region, _this.Jaws._awsAdminKeyId, _this.Jaws._awsAdminSecretKey);
      _this._awsProfile = 'default';
    }

    return Promise.resolve();
  }

  /**
   * Create Project Directory
   * @returns {Private}
   * @private
   */

  _createProjectDirectory() {
    let _this = this;

    _this._projectRootPath = path.resolve(path.join(path.dirname('.'), _this._name));

    // Prepare admin.env
    let adminEnv = 'JAWS_ADMIN_AWS_PROFILE=' + _this._awsProfile + os.EOL;

    // Prepare README.md
    let readme = '#' + _this._name;

    // Create Project Scaffolding
    return JawsUtils.writeFile(
      path.join(_this._projectRootPath, '.env'),
        'JAWS_STAGE=' + _this._stage
        + '\nJAWS_DATA_MODEL_STAGE=' + _this._stage
      )
      .then(function() {
        return Promise.all([
          fs.mkdirAsync(path.join(_this._projectRootPath, 'tests')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'lib')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'aws_modules')),
          JawsUtils.writeFile(path.join(_this._projectRootPath, 'admin.env'), adminEnv),
          JawsUtils.writeFile(path.join(_this._projectRootPath, 'README.md'), readme),
          JawsUtils.generateResourcesCf(
            _this._projectRootPath,
            _this._name,
            _this._domain,
            _this._stage,
            _this._region,
            _this._notificationEmail
          ),
          fs.writeFileAsync(path.join(_this._projectRootPath, '.gitignore'), fs.readFileSync(path.join(_this._templatesDir, 'gitignore'))),
        ]);
      });
  }

  /**
   * Create jaws bucket if it does not exist
   *
   * @returns {Promise}
   * @private
   */
  _createJawsBucket() {
    JawsUtils.jawsDebug('Creating jaws s3 bucket: ', this._jawsBucket);
    return AWSUtils.createBucket(this._awsProfile, this._region, this._jawsBucket);
  }

  /**
   * Put ENV File
   * - Creates ENV file in JAWS stage/region bucket
   * @returns {Private}
   * @private
   */

  _putEnvFile() {

    let _this = this,
        stage = this.stage;

    let envFileContents = `JAWS_STAGE=${stage}
        JAWS_DATA_MODEL_STAGE=${stage}`;

    return AWSUtils.putEnvFile(
      _this._awsProfile,
      _this._region,
      _this._jawsBucket,
      _this._name,
      _this._stage,
      envFileContents);
  }


  /**
   * Put CF File
   * @returns {Promise}
   * @private
   */

  _putCfFile() {

    let _this = this;

    return AWSUtils.putCfFile(
      _this._awsProfile,
      _this._projectRootPath,
      _this._region,
      _this._jawsBucket,
      _this._name,
      _this._stage,
      'resources');

  }

  /**
   * Create CloudFormation Stack
   * @returns {Promise}
   * @private
   */
  _createCfStack() {
    if (this._noCf) {
      JawsUtils.jawsDebug('No execute CF was specified, skipping');
      return Promise.resolve();
    }

    let _this = this;

    JawsCLI.log('Creating CloudFormation Stack for your new project (~5 mins)...');
    _this._spinner = JawsCLI.spinner();
    _this._spinner.start();

    // Create CF stack
    return AWSUtils.cfCreateResourcesStack(
      _this._awsProfile,
      _this._region,
      _this._projectRootPath,
      _this._name,
      _this._stage,
      _this._domain,
      _this._notificationEmail
      )
      .then(cfData => {
        return AWSUtils.monitorCf(cfData, _this._awsProfile, _this._region, 'create')
          .then(cfStackData => {
            _this._spinner.stop(true);
            return cfStackData;
          });
      });
  }

  /**
   * Create Project JSON
   * @private
   */
  _createProjectJson(cfStackData) {

    let _this = this,
        iamRoleArnLambda,
        iamRoleArnApiGateway;

    if (cfStackData) {
      for (let i = 0; i < cfStackData.Outputs.length; i++) {
        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          iamRoleArnLambda = cfStackData.Outputs[i].OutputValue;
        }

        if (cfStackData.Outputs[i].OutputKey === 'IamRoleArnApiGateway') {
          iamRoleArnApiGateway = cfStackData.Outputs[i].OutputValue;
        }
      }
    }

    let jawsJson = JawsUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'jaws.json'));

    jawsJson.stages[_this._stage] = [{
      region:               _this._region,
      iamRoleArnLambda:     iamRoleArnLambda || '',
      iamRoleArnApiGateway: iamRoleArnApiGateway || '',
      jawsBucket:           _this._jawsBucket,
    }];

    jawsJson.name   = _this._name;
    jawsJson.domain = _this._domain;

    fs.writeFileSync(path.join(_this._projectRootPath, 'jaws.json'),
      JSON.stringify(jawsJson, null, 2));

    return jawsJson;
  }
}

module.exports = ProjectCreate;