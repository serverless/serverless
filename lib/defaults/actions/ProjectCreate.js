'use strict';

/**
 * Action: ProjectCreate
 */

const JawsPlugin  = require('../../JawsPlugin'),
    JawsError     = require('../../jaws-error'),
    JawsCLI       = require('../../utils/cli'),
    fs            = require('fs'),
    path          = require('path'),
    os            = require('os'),
    BbPromise     = require('bluebird'),
    AWSUtils      = require('../../utils/aws'),
    JawsUtils     = require('../../utils'),
    shortid       = require('shortid');

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
    this.Jaws.action(this._action.bind(this), {
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
   * Action
   * - Contains control flow
   * @returns {Promise}
   * @private
   */

  _action(name, domain, stage, region, notificationEmail, runtime, noCf) {

    let _this = this;

    return new Promise(resolve => {

      /**
       * Non-Interactive Validations
       */

      if (!_this.Jaws._interactive) {

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
      _this._domain = domain || null;
      _this._stage = stage ? stage.toLowerCase().replace(/\W+/g, '').substring(0, 15) : null;
      _this._notificationEmail = notificationEmail;
      _this._region = region;
      _this._runtime = runtime || 'nodejs';
      _this._noCf = noCf;

      // Interactive Defaults
      if (_this.Jaws._interactive) {
        _this._prompts = {
          properties: {},
        };
        _this.Prompter = JawsCLI.prompt();
        _this.Prompter.override = {};
        _this._spinner = null;
      }

      /**
       * Control Flow
       */

      return BbPromise.try(function() {

        // ASCII Greeting
        if (_this.Jaws._interactive) JawsCLI.ascii();

      })
          .bind(_this)
          .then(_this._prompt)
          .then(_this._prepareProjectData)
          .then(_this._createProjectDirectory)
          .then(_this._putEnvFile)
          .then(_this._putCfFile)
          .then(_this._createCfStack)
          .then(_this._createProjectJson)
          .then(_this._initRuntime);

      return resolve();

    });
  }

  /**
   * Generate ShortId
   */

  _generateShortId(maxLen) {
    return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
  }

  /**
   * Prompt
   * @returns {*}
   * @private
   */

  _prompt() {

    // Skip, if not interactive
    if (!this.Jaws._interactive) return Promise.resolve();

    JawsUtils.jawsDebug('Prompting for new project information');

    let _this = this;

    let nameDescription = 'Enter a project name: ';

    // Prompt: name (project name)
    _this.Prompter.override.name = _this._name;
    // Set default name
    _this._name = 'jaws-' + _this._generateShortId(19);
    _this._prompts.properties.name = {
      description: nameDescription.yellow,
      default:     _this._name,
      message:     'Name must be only letters, numbers or dashes',
      conform:     function (name) {
        let re = /^[a-zA-Z0-9-_]+$/;
        return re.test(name);
      },
    };

    // Prompt: domain - for AWS hosted zone and more
    _this.Prompter.override.domain = _this._domain;

    let domainDescription = 'Enter a project domain (You can change this at any time:  ';

    _this._prompts.properties.domain = {
      description: domainDescription.yellow,
      default:     'myapp.com',
      message:     'Domain must only contain lowercase letters, numbers, periods and dashes',
      conform:     function (bucket) {
        let re = /^[a-z0-9-.]+$/;
        return re.test(bucket);
      },
    };

    // Prompt: notification email - for AWS alerts
    _this.Prompter.override.notificationEmail = _this._notificationEmail;
    _this._prompts.properties.notificationEmail = {
      description: 'Enter an email to use for AWS alarms: '.yellow,
      required:    true,
      message:     'Please enter a valid email',
      default:     'me@myapp.com',
      conform:     function (email) {
        if (!email) return false;
        return true;
      },
    };

    // Prompt: stage
    _this.Prompter.override.stage = _this._stage;

    let stageDescription = 'Enter a stage for this project: ';

    _this._prompts.properties.stage = {
      description: stageDescription.yellow,
      default:     'dev',
      message:     'Stage must be letters only',
      conform:     function (stage) {
        let re = /^[a-zA-Z]+$/;
        return re.test(stage);
      },
    };

    // Prompt: notification email - for AWS alerts
    _this.Prompter.override.notificationEmail = _this._notificationEmail;

    let notificationEmailDescription = 'Enter an email to use for AWS alarms: ';

    _this._prompts.properties.notificationEmail = {
      description: notificationEmailDescription.yellow,
      required:    true,
      message:     'Please enter a valid email',
      default:     'you@yourapp.com',
      conform:     function (email) {
        if (!email) return false;
        return true;
      },
    };

    // Prompt: API Keys - Create an AWS profile by entering API keys
    if (!JawsUtils.fileExistsSync(path.join(AWSUtils.getConfigDir(), 'credentials'))) {

      _this.Prompter.override.awsAdminKeyId = _this._awsAdminKeyId;

      let apiKeyDescription = 'Enter the ACCESS KEY ID for your Admin AWS IAM User: ';

      _this._prompts.properties.awsAdminKeyId = {
        description: apiKeyDescription.yellow,
        required:    true,
        message:     'Please enter a valid access key ID',
        conform:     function (key) {
          if (!key) return false;
          return true;
        },
      };
      _this.Prompter.override.awsAdminSecretKey = _this._awsAdminSecretKey;

      let apiSecretDescription = 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: ';

      _this._prompts.properties.awsAdminSecretKey = {
        description: apiSecretDescription.yellow,
        required:    true,
        message:     'Please enter a valid secret access key',
        conform:     function (key) {
          if (!key) return false;
          return true;
        },
      };
    }

    // Show Prompts
    return _this.Prompter.getAsync(_this._prompts)
        .then(function (answers) {
          _this._name = answers.name;
          _this._domain = answers.domain;
          _this._stage = answers.stage.toLowerCase();
          _this._notificationEmail = answers.notificationEmail;
          _this._awsAdminKeyId = answers.awsAdminKeyId;
          _this._awsAdminSecretKey = answers.awsAdminSecretKey;

          // If region exists, skip select prompt
          if (_this._region) return;

          // Prompt: region select
          let choices = [];
          AWSUtils.validLambdaRegions.forEach(function (r) {
            choices.push({
              key:   '',
              value: r,
              label: r,
            });
          });

          return JawsCLI.select('Select a region for your project: ', choices, false)
              .then(function (results) {
                _this._region = results[0].value;
              });
        })
        .then(function () {

          // If profile exists, skip select prompt
          if (_this._profile) return Promise.resolve();

          // If aws credentials were passed, skip select prompt
          if (_this._awsAdminKeyId && _this._awsAdminSecretKey) return Promise.resolve();

          // Prompt: profile select
          let profilesList = AWSUtils.profilesMap(),
              profiles = Object.keys(profilesList),
              choices = [];

          for (let i = 0; i < profiles.length; i++) {
            choices.push({
              key:   '',
              value: profiles[i],
              label: profiles[i],
            });
          }

          return JawsCLI.select('Select an AWS profile for your project: ', choices, false)
              .then(function (results) {
                _this._profile = results[0].value;
              });
        });
  }

  /**
   * Prepare Project Data
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
      _this._name = _this._name + '-' + _this._generateShortId(19);
    }

    // Append unique id if domain is default
    if (_this._domain === 'myapp.com') {
      _this._domain = 'myapp-' + _this._generateShortId(8) + '.com';
    }

    // Set JAWS Bucket
    _this._jawsBucket = JawsUtils.generateJawsBucketName(_this._stage, _this._region, _this._domain);

    // If no profile, ensure access keys, create profile
    if (!_this._profile) {
      AWSUtils.profilesSet('default', _this._region, _this.Jaws._awsAdminKeyId, _this.Jaws._awsAdminSecretKey);
      _this._profile = 'default';
    }

    return Promise.resolve();
  }

  /**
   * Create Project Directory
   * @private
   */

  _createProjectDirectory() {
    let _this = this;

    _this._projectRootPath = path.resolve(path.join(path.dirname('.'), _this._name));

    // Prepare admin.env
    let adminEnv = 'JAWS_ADMIN_AWS_PROFILE=' + _this._profile + os.EOL;

    // Prepare README.md
    let readme = '#' + _this._name;

    // Create Project Scaffolding
    return JawsUtils.writeFile(
        path.join(_this._projectRootPath, '.env'),
            'JAWS_STAGE=' + _this._stage
            + '\nJAWS_DATA_MODEL_STAGE=' + _this._stage
        )
        .then(function () {
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
                _this._notificationEmail,
                _this._jawsBucket
            ),
            fs.writeFileAsync(path.join(_this._projectRootPath, '.gitignore'), fs.readFileSync(__dirname + '/../../templates/gitignore')),
          ]);
        });
  }


  /**
   * Put ENV File
   * - Creates ENV file in JAWS stage/region bucket
   * @private
   */

  _putEnvFile() {

    let _this = this,
        stage = this.stage;

    let envFileContents = `JAWS_STAGE=${stage}
        JAWS_DATA_MODEL_STAGE=${stage}`;

    return AWSUtils.putEnvFile(
        _this._profile,
        _this._region,
        _this._jawsBucket,
        _this._name,
        _this._stage,
        envFileContents);
  }


  /**
   * Put CF File
   * @returns {*}
   * @private
   */

  _putCfFile() {

    let _this = this;

    return AWSUtils.putCfFile(
        _this._profile,
        _this._projectRootPath,
        _this._region,
        _this._jawsBucket,
        _this._name,
        _this._stage,
        'resources');

  }

  /**
   * Create CloudFormation Stack
   * @private
   */

  _createCfStack() {

    let _this = this;

    JawsCLI.log('Creating CloudFormation Stack for your new project (~5 mins)...');
    _this._spinner = JawsCLI.spinner();
    _this._spinner.start();

    // Create CF stack
    return AWSUtils.cfCreateResourcesStack(
        _this._profile,
        _this._region,
        _this._projectRootPath,
        _this._name,
        _this._stage,
        _this._domain,
        _this._notificationEmail,
        _this._jawsBucket
        )
        .then(function (cfData) {
          return AWSUtils.monitorCf(cfData, _this._profile, _this._region, 'create');
        });
  }

  /**
   * Create Project JSON
   * @private
   */

  _createProjectJson() {

    let _this = this,
        iamRoleArnLambda,
        iamRoleArnApiGateway;

    if (_this._cfData) {
      for (let i = 0; i < _this._cfData.Outputs.length; i++) {
        if (_this._cfData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
          iamRoleArnLambda = _this._cfData.Outputs[i].OutputValue;
        }

        if (_this._cfData.Outputs[i].OutputKey === 'IamRoleArnApiGateway') {
          iamRoleArnApiGateway = _this._cfData.Outputs[i].OutputValue;
        }
      }
    }

    let templatesPath = path.join(__dirname, '..', '..', 'templates'),
        jawsJson = JawsUtils.readAndParseJsonSync(path.join(templatesPath, 'jaws.json'));

    jawsJson.stages[_this._stage] = [{
      region:               _this._region,
      iamRoleArnLambda:     iamRoleArnLambda || '',
      iamRoleArnApiGateway: iamRoleArnApiGateway || '',
      jawsBucket:           _this._jawsBucket,
    }];

    jawsJson.name = _this._name;
    jawsJson.domain = _this._domain;

    fs.writeFileSync(path.join(_this._projectRootPath, 'jaws.json'),
        JSON.stringify(jawsJson, null, 2));

    return jawsJson;
  }

  /**
   * Init Runtime
   * @private
   */

  _initRuntime() {

    let _this = this;

    JawsCLI.log('Preparing your runtime and installing jaws-core module...');

    if (_this._runtime === 'nodejs') {
      let packageJsonTemplate = JawsUtils.readAndParseJsonSync(path.join(__dirname, '..', 'templates', 'nodejs', 'package.json'));
      packageJsonTemplate.name = _this._name;
      return fs.writeFileAsync(path.join(_this._projectRootPath, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2))
          .then(function () {
            JawsUtils.jawsDebug('test_utils', 'Running NPM install...');
            JawsUtils.npmInstall(_this._projectRootPath);
          });
    } else {
      throw new JawsError('Unsupported runtime "' + _this.runtime + '"', JawsError.errorCodes.UNKNOWN);
    }
  }
}

module.exports = ProjectCreate;