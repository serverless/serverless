'use strict';

let fs        = require('fs'),
    os        = require('os'),
    wrench    = require('wrench'),
    path      = require('path'),
    rimraf    = require('rimraf'),
    Promise   = require('bluebird'),
    uuid      = require('node-uuid'),
    SError    = require('../lib/ServerlessError'),
    SUtils    = require('../lib/utils');

/**
 * Create test private
 * @param config see tests/config.js
 * @param npmInstallDirs list of dirs relative to private root to execute npm install on
 * @returns {Promise} full path to proj temp dir that was just created
 */

module.exports.createTestProject = function(config, npmInstallDirs) {
  let projectName          = 's-test-prj',
      projectStage         = config.stage,
      projectRegion        = config.region,
      projectLambdaIAMRole = config.iamRoleArnLambda,
      projectDomain        = projectName + '.com';

  // Create Test Project
  let tmpProjectPath = path.join(os.tmpdir(), projectName);

  SUtils.sDebug('test_utils', 'Creating test project in ' + tmpProjectPath + '\n');

  // Delete test folder if already exists
  if (fs.existsSync(tmpProjectPath)) {
    rimraf.sync(tmpProjectPath);
  }

  // Copy test private to temp directory
  fs.mkdirSync(tmpProjectPath);
  wrench.copyDirSyncRecursive(path.join(__dirname, './test-prj'), tmpProjectPath, {
    forceDelete: true,
  });

  let projectJSON = SUtils.readAndParseJsonSync(path.join(tmpProjectPath, 's-project.json'));
  projectJSON.name = projectName;

  let commonVariablesPrivate = {
    project: projectName,
    domain: projectDomain,
    projectBucket: SUtils.generateProjectBucketName(projectDomain, projectRegion)
  };


  let commonVariablesPublic = {
    project: projectName
  };

  let stageVariables = {
    stage: projectStage
  };

  let regionVariables = {
    region: projectRegion,
    resourcesStackName: `${projectName}-${projectRegion}-r`,
    iamRoleArnLambda: projectLambdaIAMRole
  };

  return Promise.all([
      SUtils.writeFile(path.join(tmpProjectPath, 'meta', 'private', 'resources', `s-resources-cf-${projectStage}-${projectRegion}.json`), JSON.stringify(projectJSON.cloudFormation, null, 2)),
      SUtils.writeFile(path.join(tmpProjectPath, 'meta', 'private', 'variables', 's-variables-common.json'), JSON.stringify(commonVariablesPrivate, null, 2)),
      SUtils.writeFile(path.join(tmpProjectPath, 'meta', 'private', 'variables', `s-variables-${projectStage}.json`), JSON.stringify(stageVariables, null, 2)),
      SUtils.writeFile(path.join(tmpProjectPath, 'meta', 'private', 'variables', `s-variables-${projectStage}-${projectRegion.replace(/-/g, '')}.json`), JSON.stringify(regionVariables, null, 2)),
      SUtils.writeFile(path.join(tmpProjectPath, 'meta', 'public', 'variables', `s-variables-common.json`), JSON.stringify(commonVariablesPublic, null, 2)),
      SUtils.writeFile(path.join(tmpProjectPath, `s-project.json`), JSON.stringify(projectJSON, null, 2))
    ])
    .then(function() {

      // Write Admin.env file
      let adminEnv = 'SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID='
          + process.env.TEST_SERVERLESS_AWS_ACCESS_KEY + os.EOL
          + 'SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY='
          + process.env.TEST_SERVERLESS_AWS_SECRET_KEY + os.EOL;
      fs.writeFileSync(path.join(tmpProjectPath, 'admin.env'), adminEnv);

      //Need to run npm install on the test project, they recommend NOT doing this programatically
      //https://github.com/npm/npm#using-npm-programmatically
      if (npmInstallDirs) {

        npmInstallDirs.forEach(function(dir) {
          let fullPath = path.join(tmpProjectPath, 'back', 'modules', dir);
          SUtils.sDebug('test_utils', `Running NPM install on ${fullPath}`);
          SUtils.npmInstall(fullPath);
        });
      }

      return tmpProjectPath;
    });
};
