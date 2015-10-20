'use strict';

let fs        = require('fs'),
    os        = require('os'),
    wrench    = require('wrench'),
    path      = require('path'),
    Promise   = require('bluebird'),
    uuid      = require('node-uuid'),
    JawsError = require('../lib/jaws-error'),
    utils     = require('../lib/utils');

/**
 * Create test project
 * @param projectName
 * @param projectRegion
 * @param projectStage
 * @param projectLambdaIAMRole
 * @param projectApiGIAMRole
 * @param projectRegionBucket
 * @param npmInstallDirs list of dirs relative to project root to execute npm install on
 * @returns {Promise} full path to proj temp dir that was just created
 */

module.exports.createTestProject = function(projectName,
                                            projectStage,
                                            projectRegion,
                                            projectDomain,
                                            projectLambdaIAMRole,
                                            projectApiGIAMRole,
                                            npmInstallDirs) {
  // Create Test Project
  let tmpProjectPath = path.join(os.tmpdir(), projectName + '-' + uuid.v4());

  utils.jawsDebug('test_utils', 'Creating test project in ' + tmpProjectPath + '\n');

  if (fs.existsSync(tmpProjectPath)) {
    return Promise.reject(new JawsError('Temp dir ' + tmpProjectPath + ' already exists'));
  }

  // Copy test project to temp directory
  fs.mkdirSync(tmpProjectPath);
  wrench.copyDirSyncRecursive(path.join(__dirname, './test-prj'), tmpProjectPath, {
    forceDelete: true,
  });

  let lambdasCF   = utils.readAndParseJsonSync(__dirname + '/../lib/templates/lambdas-cf.json'),
      resourcesCF = utils.readAndParseJsonSync(__dirname + '/../lib/templates/resources-cf.json'),
      projectJSON = utils.readAndParseJsonSync(path.join(tmpProjectPath, 'jaws.json'));

  delete lambdasCF.Resources.lTemplate;

  return Promise.all([
      utils.writeFile(path.join(tmpProjectPath, 'cloudformation', projectStage, projectRegion, 'lambdas-cf.json'), JSON.stringify(lambdasCF, null, 2)),
      utils.writeFile(path.join(tmpProjectPath, 'cloudformation', projectStage, projectRegion, 'resources-cf.json'), JSON.stringify(resourcesCF, null, 2)),
    ])
    .then(function() {
      projectJSON.name                 = projectName;
      projectJSON.domain = projectDomain;
      projectJSON.stages = {};
      projectJSON.stages[projectStage] = [{
        region:               projectRegion,
        iamRoleArnLambda:     projectLambdaIAMRole,
        iamRoleArnApiGateway: projectApiGIAMRole,
        jawsBucket:           utils.generateJawsBucketName(projectStage, projectRegion, projectDomain),
      },];

      fs.writeFileSync(path.join(tmpProjectPath, 'jaws.json'), JSON.stringify(projectJSON, null, 2));
      fs.writeFileSync(path.join(tmpProjectPath, 'admin.env'), 'JAWS_ADMIN_AWS_PROFILE=' + process.env.TEST_JAWS_PROFILE);

      //Need to run npm install on the test project, they recommend NOT doing this programatically
      //https://github.com/npm/npm#using-npm-programmatically
      if (npmInstallDirs) {
        npmInstallDirs.forEach(function(dir) {
          let fullPath = path.join(tmpProjectPath, dir);
          console.log(fullPath);
          utils.jawsDebug('test_utils', `Running NPM install on ${fullPath}`);
          utils.npmInstall(fullPath);
        });
      }

      return tmpProjectPath;
    });
};
