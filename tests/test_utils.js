'use strict';

require('shelljs/global');
var fs = require('fs'),
    os = require('os'),
    del = require('del'),
    wrench = require('wrench'),
    path = require('path'),
    Promise = require('bluebird'),
    utils = require('../lib/utils');

function npmInstall(dir) {
  var cwd = process.cwd();

  process.chdir(dir);
  if (exec('npm install ', {silent: true}).code !== 0) {
    throw new Error('Error removing ' + config.tmpDir);
  }

  process.chdir(cwd);
}

/**
 * Create test project
 * @param projectName
 * @param projectRegion
 * @param projectStage
 * @param projectIAMRole
 * @param projectEnvBucket
 * @param npmInstallDirs list of dirs relative to project root to execute npm install on
 */
module.exports.createTestProject = function(projectName,
                                            projectRegion,
                                            projectStage,
                                            projectIAMRole,
                                            projectEnvBucket,
                                            npmInstallDirs) {
  // Create Test Project
  var tmpProjectPath = path.join(os.tmpdir(), projectName);

  utils.logIfVerbose('Creating test proj in ' + tmpProjectPath + '\n');

  if (fs.existsSync(tmpProjectPath)) {
    del.sync([tmpProjectPath], {force: true});
  }

  // Copy test project to temp directory
  fs.mkdirSync(tmpProjectPath);
  wrench.copyDirSyncRecursive(path.join(__dirname, './test-prj'), tmpProjectPath, {
    forceDelete: true,
  });

  // Add jaws.json project data
  var projectJSON = require(path.join(tmpProjectPath, 'jaws.json'));
  projectJSON.name = projectName;
  projectJSON.project.regions = {};
  projectJSON.project.regions[projectRegion] = {};
  projectJSON.project.regions[projectRegion].stages = {};
  projectJSON.project.regions[projectRegion].stages[projectStage] = {};
  projectJSON.project.regions[projectRegion].stages[projectStage].iamRoleArn = projectIAMRole;
  projectJSON.project.envVarBucket = {
    name: projectEnvBucket,
    region: projectRegion,
  };
  fs.writeFileSync(path.join(tmpProjectPath, 'jaws.json'), JSON.stringify(projectJSON, null, 2));

  // Create admin.env file
  fs.writeFileSync(path.join(tmpProjectPath, 'admin.env'), 'ADMIN_AWS_PROFILE=' + process.env.TEST_JAWS_PROFILE);

  //Need to run npm install on the test project, they recommend NOT doing this programatically
  //https://github.com/npm/npm#using-npm-programmatically
  if (npmInstallDirs) {
    npmInstallDirs.forEach(function(dir) {
      npmInstall(path.join(tmpProjectPath, dir));
    });
  }

  return tmpProjectPath;
};
