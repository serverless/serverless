'use strict';

/**
 * Action: ProjectCreate
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      Promise    = require('bluebird'),
      fs         = require('fs'),
      path       = require('path'),
      os         = require('os'),
      AWSUtils   = require('../../utils/aws'),
      utils      = require('../../utils'),
      shortid    = require('shortid');

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
   * @returns {Promise} upon completion of all registrations
   */
  registerActions() {
    this.Jaws.action('ProjectCreate', this._action());
    return Promise.resolve();
  }

  /**
   * Action
   * - Contains control flow
   * @returns {generator}
   * @private
   */
  _action() {

    let _this = this;

    return function*(options) {

      // Non-Interactive Validations
      if (!_this.Jaws._interactive) {
        if (!config                   ||
            !config.name              ||
            !config.stage             ||
            !config.region            ||
            !config.domain            ||
            !config.notificationEmail ||
            !config.awsAdminKeyId     ||
            !config.awsAdminSecretKey) {
          throw new JawsError('Missing required properties');
        }
      }

      // Defaults
      config = config ? config : {};
      _this._name = config.name ? config.name : null;
      _this._domain = config.domain ? config.domain : null;
      _this._stage = config.stage ? config.stage.toLowerCase().replace(/\W+/g, '').substring(0, 15) : null;
      _this._notificationEmail = config.notificationEmail;
      _this._region = config.region;
      _this._profile = config.profile;
      _this._runtime = config.runtime ? config.runtime : 'nodejs';
      _this._noCf = config.noCf;
      _this._prompts = {
        properties: {},
      };
      _this.Prompter = JawsCLI.prompt();
      _this.Prompter.override = {};
      _this._spinner = null;

      // ASCII Greeting
      if (_this.Jaws._interactive) JawsCLI.ascii();

      // Prompt
      if (_this.Jaws._interactive) yield _this._prompt();

      // Prepare project data
      yield _this._prepareProjectData();

    }
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

    utils.jawsDebug('Prompting for new project information');
    let _this = this;

    let nameDescription = 'Enter a project name: ';

    // Prompt: name (project name)
    _this.Prompter.override.name = _this._name;
    // Set default name
    _this._name = 'jaws-' + _this._generateShortId(19);
    _this._prompts.properties.name = {
      description: nameDescription.yellow,
      default: _this._name,
      message: 'Name must be only letters, numbers or dashes',
      conform: function(name) {
        let re = /^[a-zA-Z0-9-_]+$/;
        return re.test(name);
      },
    };

    // Prompt: domain - for AWS hosted zone and more
    _this.Prompter.override.domain = _this._domain;

    let domainDescription = 'Enter a project domain (You can change this at any time:  ';

    _this._prompts.properties.domain = {
      description: domainDescription.yellow,
      default: 'myapp.com',
      message: 'Domain must only contain lowercase letters, numbers, periods and dashes',
      conform: function(bucket) {
        let re = /^[a-z0-9-.]+$/;
        return re.test(bucket);
      },
    };

    // Prompt: notification email - for AWS alerts
    _this.Prompter.override.notificationEmail = _this._notificationEmail;
    _this._prompts.properties.notificationEmail = {
      description: 'Enter an email to use for AWS alarms: '.yellow,
      required: true,
      message: 'Please enter a valid email',
      default: 'me@myapp.com',
      conform: function(email) {
        if (!email) return false;
        return true;
      },
    };

    // Prompt: stage
    _this.Prompter.override.stage = _this._stage;

    let stageDescription = 'Enter a stage for this project: ';

    _this._prompts.properties.stage = {
      description: stageDescription.yellow,
      default: 'dev',
      message: 'Stage must be letters only',
      conform: function(stage) {
        let re = /^[a-zA-Z]+$/;
        return re.test(stage);
      },
    };

    // Prompt: notification email - for AWS alerts
    _this.Prompter.override.notificationEmail = _this._notificationEmail;

    let notificationEmailDescription = 'Enter an email to use for AWS alarms: ';

    _this._prompts.properties.notificationEmail = {
      description: notificationEmailDescription.yellow,
      required: true,
      message: 'Please enter a valid email',
      default: 'you@yourapp.com',
      conform: function(email) {
        if (!email) return false;
        return true;
      },
    };

    // Prompt: API Keys - Create an AWS profile by entering API keys
    if (!utils.fileExistsSync(path.join(AWSUtils.getConfigDir(), 'credentials'))) {

      _this.Prompter.override.awsAdminKeyId = _this._awsAdminKeyId;

      let apiKeyDescription = 'Enter the ACCESS KEY ID for your Admin AWS IAM User: ';

      _this._prompts.properties.awsAdminKeyId = {
        description: apiKeyDescription.yellow,
        required: true,
        message: 'Please enter a valid access key ID',
        conform: function(key) {
          if (!key) return false;
          return true;
        },
      };
      _this.Prompter.override.awsAdminSecretKey = _this._awsAdminSecretKey;

      let apiSecretDescription = 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: ';

      _this._prompts.properties.awsAdminSecretKey = {
        description: apiSecretDescription.yellow,
        required: true,
        message: 'Please enter a valid secret access key',
        conform: function(key) {
          if (!key) return false;
          return true;
        },
      };
    }

    // Show Prompts
    return _this.Prompter.getAsync(_this._prompts)
        .then(function(answers) {
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
          AWSUtils.validLambdaRegions.forEach(function(r) {
            choices.push({
              key: '',
              value: r,
              label: r,
            });
          });

          return JawsCLI.select('Select a region for your project: ', choices, false)
              .then(function(results) {
                _this._region = results[0].value;
              });
        })
        .then(function() {

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
              key: '',
              value: profiles[i],
              label: profiles[i],
            });
          }

          return JawsCLI.select('Select an AWS profile for your project: ', choices, false)
              .then(function(results) {
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
    if (utils.dirExistsSync(path.join(process.cwd(), _this._name))) {
      _this._name = _this._name + '-' + generateShortId(19);
    }

    // Append unique id if domain is default
    if (_this._domain === 'myapp.com') {
      _this._domain = 'myapp-' + generateShortId(8) + '.com';
    }

    // Set JAWS Bucket
    _this._jawsBucket = utils.generateJawsBucketName(_this._stage, _this._region, _this._domain);

    // Validate: If no profile, ensure access keys, create profile
    if (!_this._profile) {

      if (!_this._awsAdminKeyId) {
        throw new JawsError(
            'An AWS Access Key ID is required',
            JawsError.errorCodes.MISSING_AWS_CREDS);
      }

      if (!_this._awsAdminSecretKey) {
        throw new JawsError(
            'An AWS Secret Key is required',
            JawsError.errorCodes.MISSING_AWS_CREDS);
      }

      // Set profile
      AWSUtils.profilesSet('default', _this._region, _this._awsAdminKeyId, _this._awsAdminSecretKey);
      _this._profile = 'default';
    }
  }
}


module.exports = ProjectCreate;