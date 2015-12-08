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
 * Create test project
 * @param config see tests/config.js
 * @param npmInstallDirs list of dirs relative to project root to execute npm install on
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

  // Copy test project to temp directory
  fs.mkdirSync(tmpProjectPath);
  wrench.copyDirSyncRecursive(path.join(__dirname, './test-prj'), tmpProjectPath, {
    forceDelete: true,
  });

  let lambdasCF   = SUtils.readAndParseJsonSync(__dirname + '/../lib/templates/lambdas-cf.json'),
      resourcesCF = SUtils.readAndParseJsonSync(__dirname + '/../lib/templates/resources-cf.json'),
      projectJSON = SUtils.readAndParseJsonSync(path.join(tmpProjectPath, 's-project.json'));

  // Delete Lambda Template
  delete lambdasCF.Resources.lTemplate;

  // Add project name to AllowedValues
  resourcesCF.Parameters.aaProjectName.AllowedValues.push(projectName);

  // Add stages to AllowedValues
  resourcesCF.Parameters.aaStage.AllowedValues.push(config.stage);
  resourcesCF.Parameters.aaStage.AllowedValues.push(config.stage2);

  // Add stages to AllowedValues
  resourcesCF.Parameters.aaDataModelStage.AllowedValues.push(config.stage);
  resourcesCF.Parameters.aaDataModelStage.AllowedValues.push(config.stage2);

  return Promise.all([
      SUtils.writeFile(path.join(tmpProjectPath, 'cloudformation', 'lambdas-cf.json'), JSON.stringify(lambdasCF, null, 2)),
      SUtils.writeFile(path.join(tmpProjectPath, 'cloudformation', 'resources-cf.json'), JSON.stringify(resourcesCF, null, 2)),
    ])
    .then(function() {
      projectJSON.name   = projectName;
      projectJSON.domain = projectDomain;
      projectJSON.stages = {};
      projectJSON.stages[projectStage] = [{
        region:               projectRegion,
        iamRoleArnLambda:     projectLambdaIAMRole,
        regionBucket:         SUtils.generateRegionBucketName(projectRegion, projectDomain)
      },];

      fs.writeFileSync(path.join(tmpProjectPath, 's-project.json'), JSON.stringify(projectJSON, null, 2));

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
