'use strict';

require('shelljs/global');
var fs = require('fs'),
    os = require('os'),
    wrench = require('wrench'),
    path = require('path'),
    Promise = require('bluebird'),
    uuid = require('node-uuid'),
    JawsError = require('../lib/jaws-error'),
    utils = require('../lib/utils');

function npmInstall(dir) {
  var cwd = process.cwd();

  process.chdir(dir);
  if (exec('npm install ', {silent: false}).code !== 0) {
    throw new Error('Error removing ' + config.tmpDir);
  }

  process.chdir(cwd);
}

/**
 * Create test project
 * @param projectName
 * @param projectRegion
 * @param projectStage
 * @param projectLambdaIAMRole
 * @param projectApiGIAMRole
 * @param projectEnvBucket
 * @param npmInstallDirs list of dirs relative to project root to execute npm install on
 * @returns {string} full path to proj temp dir
 */
module.exports.createTestProject = function(projectName,
                                            projectRegion,
                                            projectStage,
                                            projectLambdaIAMRole,
                                            projectApiGIAMRole,
                                            projectEnvBucket,
                                            npmInstallDirs) {
  // Create Test Project
  var tmpProjectPath = path.join(os.tmpdir(), projectName + '-' + uuid.v4());

  utils.logIfVerbose('Creating test proj in ' + tmpProjectPath + '\n');

  if (fs.existsSync(tmpProjectPath)) {
    throw new JawsError('Temp dir ' + tmpProjectPath + ' already exists');
  }

  // Copy test project to temp directory
  fs.mkdirSync(tmpProjectPath);
  wrench.copyDirSyncRecursive(path.join(__dirname, './test-prj'), tmpProjectPath, {
    forceDelete: true,
  });

  // Add jaws.json project data
  var projectJSON = require(path.join(tmpProjectPath, 'jaws.json'));
  projectJSON.name = projectName;
  projectJSON.project.stages = {};
  projectJSON.project.stages[projectStage] = [{
    region: projectRegion,
    iamRoleArnLambda: projectLambdaIAMRole,
    iamRoleArnApiGateway: projectApiGIAMRole
  },];
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
      utils.logIfVerbose('Running NPM install on ' + dir);
      npmInstall(path.join(tmpProjectPath, dir));
    });
  }

  return tmpProjectPath;
};
