'use strict';

/**
 * JAWS Command: new
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 */

// Defaults
var JawsError = require('../jaws-error'),
  JawsCLI = require('../utils/cli'),
  Promise = require('bluebird'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  async = require('async'),
  AWSUtils = require('../utils/aws'),
  utils = require('../utils'),
  shortid = require('shortid'),
  extend = require('util')._extend; //OK per Isaacs and http://stackoverflow.com/a/22286375/563420

Promise.promisifyAll(fs);

// Define Project
var project = {};

/**
 * Prompt User
 *
 * @returns {Promise}
 * @private
 */
function _promptUser(projName, stage, s3Bucket, region, notificationEmail, awsProfile) {

  // Defaults
  var profiles;
  var projectName = 'jaws-new-' + shortid.generate().replace(/_/g, '').toLowerCase();
  var regions = ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-northeast-1'];
  var prompts = {
    properties: {},
  };
  var overrides = {
    name: projName,
    stage: stage,
    s3Bucket: s3Bucket,
    region: region,
    notificationEmail: notificationEmail,
    awsProfile:  awsProfile
  };
  var prompt = JawsCLI.prompt();
  prompt.override = overrides;

  return new Promise(function(resolve, reject) {

    // Prompt: project name
    prompts.properties.name = {
      description: 'Enter a project name: '.yellow,
      default: projectName,
      message: 'Name must be only letters, numbers, underscores or dashes',
      conform: function(name) {
        var re = /^[a-zA-Z0-9-_]+$/;
        return re.test(name);
      },
    };

    // Prompt: stage - initial stage for this project
    prompts.properties.stage = {
      description: 'Enter a stage for this project: '.yellow,
      default: 'dev',
      message: 'Stage must be letters only',
      conform: function(stage) {
        var re = /^[a-zA-Z]+$/;
        return re.test(stage);
      },
    };

    // Prompt: s3 bucket - holds env vars for this project
    prompts.properties.s3Bucket = {
      description: 'Enter an AWS S3 Bucket name to store this project\'s env vars: '.yellow,
      default: (overrides.projName ? overrides.projName : projectName) + '.myapp.com',
      message: 'Bucket name must only contain lowercase letters, numbers, periods and dashes',
      conform: function(bucket) {
        var re = /^[a-z0-9-.]+$/;
        return re.test(bucket);
      },
    };

    // Prompt: region - initial region for this stage
    prompts.properties.region = {
      description: JawsCLI.promptList(
        'Which AWS Region would you like to start with: ',
        regions,
        regions[0]).yellow,
      message: 'Please enter a valid region in the list',
      conform: function(region) {
        if (regions.indexOf(region)) return false;
        return true;
      },
    };

    // Prompt: notification email - for AWS alerts
    prompts.properties.notificationEmail = {
      description: 'Enter an email to use for AWS alarms: '.yellow,
      required: true,
      message: 'Please enter a valid email',
      default: 'me@myapp.com',
      conform: function(email) {
        if (!email) return false;
        return true;
      },
    };

    // Prompt: AWS Profile OR API Keys - choose an existing profile or create one by entering API keys
    if (fs.existsSync(path.join(AWSUtils.getConfigDir(), 'credentials'))) {

      var profilesList = AWSUtils.profilesMap();
      profiles = Object.keys(profilesList);

      prompts.properties.awsProfile = {
        type: 'string',
        description: JawsCLI.promptList(
          'Select the AWS Profile you would like to use for this project: ',
          profiles,
          profiles[0]).yellow,
        message: 'Please enter a valid number',
        conform: function(profile) {
          if (profiles.indexOf(profile) === -1) return false;
          return true;
        },
      };
    } else {
      // Prompt: AWS Admin Key ID
      prompts.properties.awsAdminKeyId = {
        description: 'Enter the ACCESS KEY ID for your Admin AWS IAM User: '.yellow,
        required: true,
        message: 'Please enter a valid access key ID',
        conform: function(key) {
          if (!key) return false;
          return true;
        },
      };
      // Prompt: AWS Admin Key ID
      prompts.properties.awsAdminSecretKey = {
        description: 'Enter the SECRET ACCESS KEY for your Admin AWS IAM User: '.yellow,
        required: true,
        message: 'Please enter a valid secret access key',
        conform: function(key) {
          if (!key) return false;
          return true;
        },
      };
    }

    prompt.get(prompts, function(err, result) {
      if (err) {
        reject(new JawsError(
            err,
            JawsError.errorCodes.UNKNOWN))
      }
      resolve(result);
    });
  }).then(function(answers) {
    // Add defaults for lists and match number answers to values
    answers.region = answers.region ? answers.region : regions[0];
    if (!answers.awsAdminKeyId && !answers.awsAdminSecretKey) {
      answers.awsProfile = answers.awsProfile ? answers.awsProfile : profiles[0];
    }
    return Promise.resolve(answers);
  });
}

/**
 * Prepare project data
 *
 * @param answers
 * @returns {Promise}
 * @private
 */
function _prepareProjectData(answers) {
  if (answers.stage.toLowerCase() == 'local') {
    Promise.reject(new JawsError(
      'Stage ' + answers.stage + ' is reserved',
      JawsError.errorCodes.UNKNOWN));
  }

  project.name = answers.name.toLowerCase().trim()
    .replace(/[^a-zA-Z-\d\s:]/g, '')
    .replace(/\s/g, '-')
    .substring(0, 19);

  // AWS only allows Alphanumeric and - in name
  var nameOk = /^([a-zA-Z0-9-]+)$/.exec(project.name);
  if (!nameOk) {
    Promise.reject(new JawsError(
      'Project names can only be alphanumeric and -',
      JawsError.errorCodes.INVALID_PROJ_NAME));
  }

  // Append unique id if name is in use
  if (fs.existsSync(path.join(process.cwd(), project.name))) {
    project.name = project.name + '-' + shortid.generate().replace(/[_-]/g, '');
  }

  // Set or Create Profile
  if (answers.awsProfile) {

    project.awsProfile = answers.awsProfile;

  } else {

    if (!answers.awsAdminKeyId) {
      reject(new JawsError(
        'An AWS Access Key ID is required',
        JawsError.errorCodes.MISSING_AWS_CREDS));
    }

    if (!answers.awsAdminSecretKey) {
      reject(new JawsError(
        'An AWS Secret Key is required',
        JawsError.errorCodes.MISSING_AWS_CREDS));
    }

    // Set profile
    AWSUtils.profilesSet('default', answers.region, answers.awsAdminKeyId, answers.awsAdminSecretKey);
    project.awsProfile = 'default';
  }

  // Set other project data
  project.stage = answers.stage;
  project.region = answers.region;
  project.notificationEmail = answers.notificationEmail.trim();
  project.s3Bucket = answers.s3Bucket;

  return Promise.resolve();
}

/**
 * Create Project Directory
 * @returns {Promise}
 * @private
 */
function _createProjectDirectory() {

  // Set Root Path
  project.rootPath = path.resolve(path.join(path.dirname('.'), project.name));

  // Prepare admin.env
  var adminEnv = 'ADMIN_AWS_PROFILE=' + project.awsProfile + os.EOL;

  // Prepare CloudFormation template
  var cfTemplate = require('../templates/jaws-cf');
  cfTemplate.Parameters.aaProjectName.Default = project.name;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [project.name];
  cfTemplate.Parameters.aaStage.Default = project.stage;
  cfTemplate.Parameters.aaDataModelPrefix.Default = project.stage; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaNotficationEmail.Default = project.notificationEmail;

  // Create files
  return utils.writeFile(
      path.join(project.rootPath, 'back', '.env'),
      'JAWS_STAGE=' + project.stage + '\nJAWS_DATA_MODEL_PREFIX=' + project.stage   )
    .then(function() {
      return Promise.all([
        fs.mkdirAsync(path.join(project.rootPath, 'front')),
        fs.mkdirAsync(path.join(project.rootPath, 'tests')),
        fs.mkdirAsync(path.join(project.rootPath, 'back/lambdas')),
        fs.mkdirAsync(path.join(project.rootPath, 'back/lib')),
        utils.writeFile(path.join(project.rootPath, 'admin.env'), adminEnv),
        utils.writeFile(path.join(project.rootPath, 'jaws-cf.json'), JSON.stringify(cfTemplate, null, 2)),
      ]);
    });
}

/**
 * Create s3 bucket (if DNE) and upload the 1st stage env var
 *
 * Format: <bucket>/JAWS/envVars/<projName>/<stage>
 *
 * @returns {Promise}
 * @private
 */
function _createS3JawsStructure() {
  return AWSUtils.createBucket(project.awsProfile, project.region, project.s3Bucket)
    .then(function() {
      var envFileContents = 'JAWS_STAGE=' + project.stage + '\nJAWS_DATA_MODEL_PREFIX=' + project.stage;
      return AWSUtils.putEnvFile(
        project.awsProfile,
        project.region,
        project.s3Bucket,
        project.name,
        project.stage,
        envFileContents);
    });
}

/**
 * Create CloudFormation Stack
 */

function _createCfStack() {
  // Show loading messages
  var message = 'JAWS is now going to create an AWS CloudFormation Stack for the "' + project.stage +
    '" stage of your JAWS project. This doesn\'t cost anything, but takes around 5 minutes to set-up. Sit tight!';

  // Start loading icon
  var spinner = JawsCLI.spinner('Creating CloudFormation Stack for your new project...');
  spinner.start();

  // Create CF stack
  return AWSUtils.cfCreateStack(
      project.awsProfile,
      project.region,
      project.rootPath,
      project.name,
      project.stage,
      project.notificationEmail
  )
      .then(function(cfData) {
        return AWSUtils.monitorCfCreate(cfData, project.awsProfile, project.region, spinner);
      });
    });
}

/**
 * Create Project JSON
 *
 * @param cfOutputs. Optional
 * @returns {Promise} jaws json js obj
 * @private
 */
function _createProjectJson(cfOutputs) {

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
    name: project.name,
    version: '0.0.1',
    location: '<enter project\'s github repository url here>',
    author: 'You <you@yourapp.com>',
    description: project.name + ': An ambitious, server-less application built with the JAWS framework.',
    project: {
      stages: {},
    },
  };

  jawsJson.project.stages[project.stage] = [];
  jawsJson.project.stages[project.stage].push({
    region: project.region,
    iamRoleArnLambda: iamRoleArnLambda || '',
    iamRoleArnApiGateway: iamRoleArnApiGateway || '',
  });

  jawsJson.project.envVarBucket = {
    name: project.s3Bucket,
    region: project.region,
  };

  fs.writeFileSync(path.join(project.rootPath, 'jaws.json'), JSON.stringify(jawsJson, null, 2));

  JawsCLI.log('Your project "' +
    project.name +
    '" has been successfully created in the current directory.'
  );

  return Promise.resolve(jawsJson);
}

/**
 *
 * @param projName
 * @param stage
 * @param s3Bucket store things like env vars: <bucket>/JAWS/envVars/<proj-name>/<stage>. Create bucket if DNE
 * @param region
 * @param notificationEmail
 * @param awsProfile
 * @param noExeCf don't execute CloudFormation at the end
 * @returns {*}
 */
module.exports.create = function(projName, stage, s3Bucket, lambdaRegion, notificationEmail, awsProfile, noExeCf) {
  return _getAnswers(projName, stage, s3Bucket, lambdaRegion, notificationEmail, awsProfile)
      .then(_prepareProjectData)
      .then(_createS3JawsStructure) //see if bucket is avail first before doing work
      .then(_createProjectDirectory)
      .then(function() {
        if (noExeCf) {
          utils.logIfVerbose('No exec cf specified, updating proj jaws.json only');
          console.log('Project and env var file in s3 successfully created. CloudFormation file can be run manually');
          console.log('After creating CF stack, remember to put the IAM role outputs in your project jaws.json');

          return _createProjectJson();
        } else {
          return _createCfStack()
              .then(_createProjectJson);
        }
      });
};
