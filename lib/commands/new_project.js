'use strict';

/**
 * JAWS Command: new project
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 * - Creates IAM resources via CloudFormation
 */

// Defaults
var JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils'),
    shortid = require('shortid');

Promise.promisifyAll(fs);

/**
 * Run
 * @param name
 * @param stage
 * @param s3Bucket
 * @param notificationEmail
 * @param region
 * @param profile
 * @param noCf
 * @returns {*}
 */

module.exports.run = function(name, stage, s3Bucket, notificationEmail, region, profile, noCf) {
  var command = new CMD(
      name,
      stage,
      s3Bucket,
      notificationEmail,
      region,
      profile,
      noCf);
  return command.run();
};

/**
 * CMD Class
 * @param name
 * @param stage
 * @param s3Bucket
 * @param notificationEmail
 * @param region
 * @param profile
 * @param noExeCf
 * @constructor
 */

function CMD(name, stage, s3Bucket, notificationEmail, region, profile, noCf) {

  // Defaults
  this._name = name ? name : null;
  this._stage = stage ? stage.toLowerCase().replace(/\W+/g, '').substring(0, 15) : null;
  this._s3Bucket = s3Bucket;
  this._notificationEmail = notificationEmail;
  this._region = region;
  this._profile = profile;
  this._noCf = noCf;
  this._prompts = {
    properties: {},
  };
  this.Prompter = JawsCLI.prompt();
  this.Prompter.override = {};
}

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return Promise.try(function() {

    // ASCII Greeting
    JawsCLI.ascii();

  })
      .bind(_this)
      .then(_this._prompt)
      .then(_this._prepareProjectData)
      .then(_this._createS3JawsStructure) //see if bucket is avail first before doing work
      .then(_this._createProjectDirectory)
      .then(function() {
        if (!_this._noCf) {
          return _this._createCfStack();
        } else {
          utils.logIfVerbose('No exec cf specified, updating proj jaws.json only');
          JawsCLI.log('Project and env var file in s3 successfully created. CloudFormation file can be run manually');
          JawsCLI.log('After creating CF stack, remember to put the IAM role outputs in your project jaws.json');
        }
      })
      .then(_this._createProjectJson);
});

/**
 * CMD: Prompt
 */

CMD.prototype._prompt = Promise.method(function() {

  var _this = this;

  // Prompt: name (project name)
  _this.Prompter.override.name = _this._name;
  _this._prompts.properties.name = {
    description: 'Enter a project name: '.yellow,
    default: 'jaws-' + shortid.generate().replace(/\W+/g, '').substring(0, 19),
    message: 'Name must be only letters, numbers, underscores or dashes',
    conform: function(name) {
      var re = /^[a-zA-Z0-9-_]+$/;
      return re.test(name);
    },
  };

  // Prompt: stage
  _this.Prompter.override.stage = _this._stage;
  _this._prompts.properties.stage = {
    description: 'Enter a stage for this project: '.yellow,
    default: 'dev',
    message: 'Stage must be letters only',
    conform: function(stage) {
      var re = /^[a-zA-Z]+$/;
      return re.test(stage);
    },
  };

  // Prompt: s3 bucket - holds env vars for this project
  _this.Prompter.override.s3Bucket = _this._s3Bucket;
  _this._prompts.properties.s3Bucket = {
    description: 'Enter an AWS S3 Bucket name to store this project\'s env vars: '.yellow,
    default: 'jaws.yourapp.com',
    message: 'Bucket name must only contain lowercase letters, numbers, periods and dashes',
    conform: function(bucket) {
      var re = /^[a-z0-9-.]+$/;
      return re.test(bucket);
    },
  };

  // Prompt: notification email - for AWS alerts
  _this.Prompter.override.notificationEmail = _this._notificationEmail;
  _this._prompts.properties.notificationEmail = {
    description: 'Enter an email to use for AWS alarms: '.yellow,
    required: true,
    message: 'Please enter a valid email',
    default: 'you@yourapp.com',
    conform: function(email) {
      if (!email) return false;
      return true;
    },
  };

  // Prompt: API Keys - Create an AWS profile by entering API keys
  if (!fs.existsSync(path.join(AWSUtils.getConfigDir(), 'credentials'))) {

    _this.Prompter.override.awsAdminKeyId = _this._awsAdminKeyId;
    _this._prompts.properties.awsAdminKeyId = {
      description: 'Enter the ACCESS KEY ID for your Admin AWS IAM User: '.yellow,
      required: true,
      message: 'Please enter a valid access key ID',
      conform: function(key) {
        if (!key) return false;
        return true;
      },
    };
    _this.Prompter.override.awsAdminSecretKey = _this._awsAdminSecretKey;
    _this._prompts.properties.awsAdminSecretKey = {
      description: 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: '.yellow,
      required: true,
      message: 'Please enter a valid secret access key',
      conform: function(key) {
        if (!key) return false;
        return true;
      },
    };
  }

  // Show Prompts
  return new Promise(function(resolve, reject) {
    _this.Prompter.get(_this._prompts, function(err, answers) {
      if (err) {
        reject(new JawsError(err));
      }
      resolve(answers);
    });
  })
      .then(function(answers) {

        // Set Answers
        _this._name = answers.name;
        _this._stage = answers.stage.toLowerCase();
        _this._s3Bucket = answers.s3Bucket;
        _this._notificationEmail = answers.notificationEmail;
        _this._awsAdminKeyId = answers.awsAdminKeyId;
        _this._awsAdminSecretKey = answers.awsAdminSecretKey;

        // If region exists, skip select prompt
        if (_this._region) return Promise.resolve();

        // Prompt: region select
        var choices = [
          { key: '1) ', label: 'us-east-1', value: 'us-east-1' },
          { key: '2) ', label: 'us-west-1', value: 'us-west-1' },
          { key: '3) ', label: 'eu-west-1', value: 'eu-west-1' },
          { key: '4) ', label: 'ap-northeast-1', value: 'ap-northeast-1' },
        ];

        return JawsCLI.select('Select a region for your project: ', choices, false)
            .then(function(results) {
              _this._region = results[0].value;
              return Promise.resolve();
            });
      })
      .then(function() {

        // If profile exists, skip select prompt
        if (_this._profile) return Promise.resolve();

        // Prompt: profile select
        var profilesList = AWSUtils.profilesMap(),
            profiles = Object.keys(profilesList),
            choices = [];

        for (var i = 0; i < profiles.length; i++) {
          choices.push({
            key:   (i + 1) + ') ',
            value: profiles[i],
            label: profiles[i],
          });
        }

        return JawsCLI.select('Select a profile for your project: ', choices, false)
            .then(function(results) {
              _this._profile = results[0].value;
              return Promise.resolve();
            });
      });
});

/**
 * CMD: Prepare Project Data
 * @returns {Promise}
 * @private
 */

CMD.prototype._prepareProjectData = Promise.method(function() {

  var _this = this;

  // Validate: Ensure stage isn't "local"
  if (_this._stage.toLowerCase() == 'local') {
    throw new JawsError('Stage ' + _this._stage + ' is reserved');
  }

  // Validate: AWS only allows Alphanumeric and - in name
  var nameOk = /^([a-zA-Z0-9-]+)$/.exec(_this._name);
  if (!nameOk) {
    throw new JawsError('Project names can only be alphanumeric and -');
  }

  // Append unique id if name is in use
  if (fs.existsSync(path.join(process.cwd(), _this._name))) {
    _this._name = _this._name + '-' + shortid.generate().replace(/\W+/g, '').substring(0, 19);
  }

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
});

/**
 * CMD: Create Project Directory
 * @returns {Promise}
 * @private
 */

CMD.prototype._createProjectDirectory = Promise.method(function() {

  var _this = this;

  _this._projectRootPath = path.resolve(path.join(path.dirname('.'), _this._name));

  // Prepare admin.env
  var adminEnv = 'ADMIN_AWS_PROFILE=' + _this._profile + os.EOL;

  // Prepare CloudFormation template
  var cfTemplate = require('../templates/jaws-cf');
  cfTemplate.Parameters.aaProjectName.Default = _this._name;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [_this._name];
  cfTemplate.Parameters.aaStage.Default = _this._stage;
  cfTemplate.Parameters.aaDataModelPrefix.Default = _this._stage; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaNotficationEmail.Default = _this._notificationEmail;

  // Create Project Scaffolding
  return utils.writeFile(
      path.join(_this._projectRootPath, 'back', '.env'),
      'JAWS_STAGE=' + _this._stage
      + '\nJAWS_DATA_MODEL_PREFIX=' + _this._stage)
      .then(function() {
        return Promise.all([
          fs.mkdirAsync(path.join(_this._projectRootPath, 'front')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'tests')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back/lambdas')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back/lib')),
          utils.writeFile(path.join(_this._projectRootPath, 'admin.env'), adminEnv),
          utils.writeFile(path.join(_this._projectRootPath, 'jaws-cf.json'), JSON.stringify(cfTemplate, null, 2)),
        ]);
      });
});

/**
 * CMD Create S3 Bucket
 * (if DNE) and upload the 1st stage env var
 * Format: <bucket>/JAWS/envVars/<name>/<stage>
 *
 * @returns {Promise}
 * @private
 */

CMD.prototype._createS3JawsStructure = Promise.method(function() {

  var _this = this;

  return AWSUtils.createBucket(_this._profile, _this._region, _this._s3Bucket)
      .then(function() {

        var envFileContents = 'JAWS_STAGE=' + _this._stage
            + '\nJAWS_DATA_MODEL_PREFIX=' + _this._stage;

        return AWSUtils.putEnvFile(
            _this._profile,
            _this._region,
            _this._s3Bucket,
            _this._name,
            _this._stage,
            envFileContents);
      });
});

/**
 * CMD: Create CloudFormation Stack
 */

CMD.prototype._createCfStack = Promise.method(function() {

  var _this = this;

  // Show loading messages
  var message = 'JAWS is now going to create an AWS CloudFormation Stack for the "' + _this._stage +
      '" stage of your JAWS project. This doesn\'t cost anything, but takes around 5 minutes to set-up. Sit tight!';

  // Start loading icon
  var spinner = JawsCLI.spinner('Creating CloudFormation Stack for your new project...');
  spinner.start();

  // Create CF stack
  return AWSUtils.cfCreateStack(
      _this._profile,
      _this._region,
      _this._projectRootPath,
      _this._name,
      _this._stage,
      _this._notificationEmail)
      .then(function(cfData) {
        return AWSUtils.monitorCfCreate(cfData, _this._profile, _this._region, spinner);
      });
});

/**
 * CMD: Create Project JSON
 *
 * @param cfOutputs. Optional
 * @returns {Promise} jaws json js obj
 * @private
 */

CMD.prototype._createProjectJson = Promise.method(function(cfOutputs) {

  var _this = this;

  var iamRoleArnLambda,
      iamRoleArnApiGateway;

  if (cfOutputs) {
    for (var i = 0; i < cfOutputs.length; i++) {
      if (cfOutputs[i].OutputKey === 'IamRoleArnLambda') {
        iamRoleArnLambda = cfOutputs[i].OutputValue;
      }

      if (cfOutputs[i].OutputKey === 'IamRoleArnApiGateway') {
        iamRoleArnApiGateway = cfOutputs[i].OutputValue;
      }
    }
  }

  var jawsJson = {
    name: _this._name,
    version: '0.0.1',
    location: '<enter project\'s github repository url here>',
    author: 'You <you@yourapp.com>',
    description: _this._name + ': An ambitious, server-less application built with the JAWS framework.',
    project: {
      stages: {},
    },
  };

  jawsJson.project.stages[_this._stage] = [];
  jawsJson.project.stages[_this._stage].push({
    region: _this._region,
    iamRoleArnLambda: iamRoleArnLambda || '',
    iamRoleArnApiGateway: iamRoleArnApiGateway || '',
  });

  jawsJson.project.envVarBucket = {
    name: _this._s3Bucket,
    region: _this._region,
  };

  fs.writeFileSync(path.join(_this._projectRootPath, 'jaws.json'),
      JSON.stringify(jawsJson, null, 2));

  JawsCLI.log('Your project "' + _this._name
      + '" has been successfully created in the current directory.');

  return jawsJson;
});