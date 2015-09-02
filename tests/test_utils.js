'use strict';

var fs = require('fs'),
    os = require('os'),
    del = require('del'),
    wrench = require('wrench'),
    path = require('path');

/**
 * Create Test Project
 */

module.exports.createTestProject = function(projectName, projectRegion, projectStage, projectIAMRole, projectEnvBucket) {
  // Create Test Project
  var projectPath = path.join(os.tmpdir(), projectName);
  if (fs.existsSync(projectPath)) {
    del.sync([projectPath], {force: true});
  }

  // Copy test project to temp directory
  fs.mkdirSync(projectPath);
  wrench.copyDirSyncRecursive(path.join(__dirname, './test-prj'), projectPath, {
    forceDelete: true,
  });

  // Add jaws.json project data
  var projectJSON = require(path.join(projectPath, 'jaws.json'));
  projectJSON.project.regions = {};
  projectJSON.project.regions[projectRegion] = {};
  projectJSON.project.regions[projectRegion].stages = {};
  projectJSON.project.regions[projectRegion].stages[projectStage] = {};
  projectJSON.project.regions[projectRegion].stages[projectStage].iamRoleArn = projectIAMRole;
  projectJSON.project.envVarBucket = {
    name: projectEnvBucket,
    region: projectRegion,
  };
  fs.writeFileSync(path.join(projectPath, 'jaws.json'), projectJSON);

  // Create admin.env file
  fs.writeFileSync(path.join(projectPath, 'admin.env'), 'ADMIN_AWS_PROFILE=' + process.env.TEST_JAWS_PROFILE);

  return projectPath;
};