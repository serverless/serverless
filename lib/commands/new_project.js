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
    chalk = require('chalk'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils'),
    shortid = require('shortid');

Promise.promisifyAll(fs);

/**
 * Run
 * @param name
 * @param stage
 * @param domain
 * @param region
 * @param notificationEmail
 * @param profile
 * @param noCf
 * @returns {*}
 */

module.exports.run = function(name, stage, domain, region, notificationEmail, profile, noCf) {
  utils.jawsDebug('Running new project:', name);
  var command = new CMD(
      name,
      stage,
      domain,
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
 * @param domain
 * @param notificationEmail
 * @param region
 * @param profile
 * @param noCf
 * @constructor
 */

function CMD(name, stage,domain, notificationEmail, region, profile, noCf) {

  // Defaults
  this._name = name ? name : null;
  this._domain = domain ? domain : null;
  this._stage = stage ? stage.toLowerCase().replace(/\W+/g, '').substring(0, 15) : null;
  this._notificationEmail = notificationEmail;
  this._region = region;
  this._profile = profile;
  this._noCf = noCf;
  this._prompts = {
    properties: {},
  };
  this.Prompter = JawsCLI.prompt();
  this.Prompter.override = {};
  this._spinner = null;
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
      //.then(_this._createS3JawsStructure) //see if bucket is avail first before doing work
      .then(_this._createProjectDirectory)
      .then(function() {
        if (_this._noCf) {
          JawsCLI.log('Project and env var file in s3 successfully created. CloudFormation file can be run manually');
          JawsCLI.log('!!MAKE SURE!! to create stack with name: ' + AWSUtils.cfGetResourcesStackName(_this._stage, _this._name));
          JawsCLI.log('After creating CF stack, remember to put the IAM role outputs in your project jaws.json');
          return false;
        } else {
          return _this._createCfStack()
              .then(function(cfData) {
                if (_this._spinner) {
                  _this._spinner.stop(true);
                }
                return cfData;
              });
        }
      })
      .then(_this._createProjectJson);
});

/**
 * CMD: Prompt
 */

CMD.prototype._prompt = Promise.method(function() {

  utils.jawsDebug('Prompting for new project information');
  var _this = this;

  var nameDescription = 'Enter a project name: ' + os.EOL;

  // Prompt: name (project name)
  _this.Prompter.override.name = _this._name;
  _this._prompts.properties.name = {
    description: nameDescription.yellow,
    default: 'jaws-' + shortid.generate().replace(/\W+/g, '').substring(0, 19).replace('_', ''),
    message: 'Name must be only letters, numbers, underscores or dashes',
    conform: function(name) {
      var re = /^[a-zA-Z0-9-_]+$/;
      return re.test(name);
    },
  };

  // Prompt: domain - for AWS hosted zone and more
  _this.Prompter.override.domain = _this._domain;

  var domainDescription = 'Enter a project domain:  '
      + os.EOL
      + ' - You don’t need to currently own this domain.  '
      + os.EOL
      + ' - JAWS will use it to uniquely namespace S3 buckets that store this project\'s data.'
      + os.EOL
      + ' - However, if you do set up this domain as a Hosted Zone on Route 53 you will benefit from extra features'
      + os.EOL
      + ' - You can enter a placeholder for now and change this at any time.'
      + os.EOL;

  _this._prompts.properties.domain = {
    description: domainDescription.yellow,
    default: 'myapp.com',
    message: 'Domain must only contain lowercase letters, numbers, periods and dashes',
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

  // Prompt: stage
  _this.Prompter.override.stage = _this._stage;

  var stageDescription = 'Enter a stage for this project: ' + os.EOL;

  _this._prompts.properties.stage = {
    description: stageDescription.yellow,
    default: 'dev',
    message: 'Stage must be letters only',
    conform: function(stage) {
      var re = /^[a-zA-Z]+$/;
      return re.test(stage);
    },
  };

  // Prompt: notification email - for AWS alerts
  _this.Prompter.override.notificationEmail = _this._notificationEmail;

  var notificationEmailDescription = 'Enter an email to use for AWS alarms: ' + os.EOL;

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

    var apiKeyDescription = 'Enter the ACCESS KEY ID for your Admin AWS IAM User: ' + os.EOL;

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

    var apiSecretDescription = 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: ' + os.EOL;

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
        var choices = [];
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
        var profilesList = AWSUtils.profilesMap(),
            profiles = Object.keys(profilesList),
            choices = [];

        for (var i = 0; i < profiles.length; i++) {
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
  if (utils.dirExistsSync(path.join(process.cwd(), _this._name))) {
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
  var cfTemplate = utils.readAndParseJsonSync(__dirname + '/../templates/resources-cf.json');
  cfTemplate.Parameters.aaProjectName.Default = _this._name;
  cfTemplate.Parameters.aaProjectDomain.Default = _this._domain;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [_this._name];
  cfTemplate.Parameters.aaStage.Default = _this._stage;
  cfTemplate.Parameters.aaDataModelStage.Default = _this._stage; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaNotficationEmail.Default = _this._notificationEmail;
  cfTemplate.Description = _this._name + " resources";

  // Create Project Scaffolding
  return utils.writeFile(
          path.join(_this._projectRootPath, 'back', '.env'),
          'JAWS_STAGE=' + _this._stage
          + '\nJAWS_DATA_MODEL_STAGE=' + _this._stage
      )
      .then(function() {
        return Promise.all([
          fs.mkdirAsync(path.join(_this._projectRootPath, 'front')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'tests')),
          fs.mkdirAsync(path.join(_this._projectRootPath, 'back', 'aws_modules')),
          utils.writeFile(path.join(_this._projectRootPath, 'admin.env'), adminEnv),
          utils.generateResourcesCf(
              _this._projectRootPath,
              _this._name,
              _this._domain,
              _this._stage,
              _this._region,
              _this._notificationEmail
          ),
          fs.writeFileAsync(path.join(_this._projectRootPath, '.gitignore'), fs.readFileSync(__dirname + '/../templates/gitignore')),
        ]);
      });
});

/**
 * CMD Create S3 Bucket
 * (if DNE) and upload the 1st stage env var
 * Format: <bucket>/JAWS/envVars/<proj-name>/<stage>
 *
 * @returns {Promise}
 * @private
 */

CMD.prototype._createS3JawsStructure = Promise.method(function() {

  var _this = this;

  return AWSUtils.createBucket(_this._profile, _this._region, _this._s3Bucket)
      .then(function() {

        var envFileContents = 'JAWS_STAGE=' + _this._stage
            + '\nJAWS_DATA_MODEL_STAGE=' + _this._stage;

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
          _this._notificationEmail)
      .then(function(cfData) {
        return AWSUtils.monitorCf(cfData, _this._profile, _this._region, 'create');
      });
});

/**
 * CMD: Create Project JSON
 *
 * @param cfOutputs. Optional
 * @returns {Promise} jaws json js obj
 * @private
 */

CMD.prototype._createProjectJson = Promise.method(function(cfData) {
  var _this = this,
      iamRoleArnLambda,
      iamRoleArnApiGateway;

  if (cfData) {
    for (var i = 0; i < cfData.Outputs.length; i++) {
      if (cfData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
        iamRoleArnLambda = cfData.Outputs[i].OutputValue;
      }

      if (cfData.Outputs[i].OutputKey === 'IamRoleArnApiGateway') {
        iamRoleArnApiGateway = cfData.Outputs[i].OutputValue;
      }
    }
  }

  var templatesPath = path.join(__dirname, '..', 'templates'),
      jawsJson = utils.readAndParseJsonSync(path.join(templatesPath, 'jaws.json'));

  jawsJson.stages[_this._stage] = [{
    region: _this._region,
    iamRoleArnLambda: iamRoleArnLambda || '',
    iamRoleArnApiGateway: iamRoleArnApiGateway || '',
    jawsBucket: utils.generateJawsBucketName(_this._stage, _this._region, _this._domain)
  }];

  jawsJson.jawsBuckets[_this._region] = _this._s3Bucket;
  jawsJson.name = _this._name;

  fs.writeFileSync(path.join(_this._projectRootPath, 'jaws.json'),
      JSON.stringify(jawsJson, null, 2));

  JawsCLI.log('Your project "' + _this._name
      + '" has been successfully created in the current directory.');

  return jawsJson;
});
