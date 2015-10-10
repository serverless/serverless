'use strict';

/**
 * JAWS Command: postinstall
 * - Performs automation after an aws-module is installed via a package manager
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    JawsCLI = require('../utils/cli'),
    utils = require('../utils'),
    path = require('path'),
    fs = require('fs'),
    wrench = require('wrench'),
    temp = require('temp'),
    chalk = require('chalk');

Promise.promisifyAll(fs);
Promise.promisifyAll(temp);
Promise.promisifyAll(wrench);

temp.track();

module.exports.run = function(JAWS, moduleName, packageManager) {
  var command = new CMD(JAWS, moduleName, packageManager);
  return command.run();
};

function CMD(JAWS, moduleName, packageManager) {
  if (['npm'].indexOf(packageManager) == -1) {
    return Promise.reject(new JawsError('Unsupported package manager', JawsError.errorCodes.UNKNOWN));
  }
  this._JAWS = JAWS;
  this._moduleName = moduleName;
  this._packageManager = packageManager;
  this._rootAwsmJson = {};
}

CMD.prototype.constructor = CMD;

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._installFiles)
      .then(function(module) {
        return Promise.all([module, _this._saveCfTemplate(module.path)]);
      })
      .spread(function(module) {
        var deferredDepInstalls = [];

        switch (_this._packageManager) {
          case 'npm':
            if (utils.fileExistsSync(path.join(module.path, 'package.json'))) {
              deferredDepInstalls.push(utils.npmInstall(module.path));
            }
            break;
          default:
            throw new JawsError('Unsupported package manager', JawsError.errorCodes.UNKNOWN);
            break;
        }

        if (deferredDepInstalls.length > 0) {
          JawsCLI.log('Installing ' + _this._packageManager + ' dependencies...');
        }

        return Promise.all(deferredDepInstalls);
      })
      .then(function() {
        return utils.findAllEnvVarsForAwsm(_this._JAWS._meta.projectRootPath, _this._moduleName);
      })
      .then(function(envVars) {
        JawsCLI.log('Successfully installed ' + _this._moduleName);

        if (envVars && envVars.length > 1) {
          JawsCLI.log(
              chalk.bgYellow.white(' WARN ') +
              chalk.magenta(' This aws module uses env vars MAKE SURE to run jaws env list to see which ones need to be set')
          );
        }
      });
});

/**
 * Install Files
 *
 * @returns {Promise} object {name: awsmJson.name, path: targetModPath}
 */

CMD.prototype._installFiles = Promise.method(function() {

  var _this = this,
      pkgMgrDir;

  if (_this._packageManager == 'npm') {
    pkgMgrDir = 'node_modules';
  }

  var srcAwsmPath = path.join(_this._JAWS._meta.projectRootPath, pkgMgrDir, _this._moduleName, 'awsm'),
      srcAwsmJsonPath = path.join(_this._JAWS._meta.projectRootPath, pkgMgrDir, _this._moduleName, 'awsm.json'),
      awsModsPath = path.join(_this._JAWS._meta.projectRootPath, 'aws_modules');

  if (!utils.fileExistsSync(srcAwsmJsonPath)) {
    throw new JawsError('Module missing awsm.json file in root of project', JawsError.errorCodes.UNKNOWN);
  }

  var awsmJson = utils.readAndParseJsonSync(srcAwsmJsonPath);
  _this._rootAwsmJson = awsmJson;

  if (!awsmJson.name) {
    throw new JawsError('awsm.json for module missing name attr', JawsError.errorCodes.UNKNOWN);
  }

  var targetModPath = path.join(awsModsPath, awsmJson.name);

  if (!_this._delExisting && utils.dirExistsSync(targetModPath)) {
    throw new JawsError('Module named ' + awsmJson.name + ' already exists in your project', JawsError.errorCodes.UNKNOWN);
  }

  if (
      (!awsmJson.resources) || (!awsmJson.resources.cloudFormation) ||
      (!awsmJson.resources.cloudFormation.LambdaIamPolicyDocumentStatements) ||
      (!awsmJson.resources.cloudFormation.ApiGatewayIamPolicyDocumentStatements)
  ) {
    throw new JawsError('Module does not have required cloudFormation attributes', JawsError.errorCodes.UNKNOWN);
  }

  //Copy over jaws awsm scaffolding
  JawsCLI.log('Copying ' + srcAwsmPath + ' to ' + targetModPath);
  wrench.copyDirSyncRecursive(
      srcAwsmPath,
      targetModPath, {
        forceDelete: true,
        excludeHiddenUnix: false,
      });

  //Write mod root awsm.json so we can identify awsm dirs later
  return utils.writeFile(path.join(targetModPath, 'awsm.json'), JSON.stringify(awsmJson, null, 2))
      .then(function() {
        return {name: awsmJson.name, path: targetModPath};
      });
});

/**
 * Save CloudFormation attrs
 *
 * @returns {Promise}
 */

CMD.prototype._saveCfTemplate = Promise.method(function() {
  var _this = this,
      awsmJson = _this._rootAwsmJson,
      projectCfPath = path.join(this._JAWS._meta.projectRootPath, 'cloudformation');

  var cfExtensionPoints = awsmJson.resources.cloudFormation;

  if (!utils.dirExistsSync(projectCfPath)) {
    throw new JawsError('Your project has no cloudformation dir', JawsError.errorCodes.UNKNOWN);
  }

  //Update every resources-cf.json for every stage and region. Deep breath...
  return new Promise(function(resolve, reject) {
    resolve(wrench.readdirSyncRecursive(projectCfPath))
  })
      .then(function(files) {
        files.forEach(function(file) {
          file = path.join(projectCfPath, file);
          if (utils.endsWith(file, 'resources-cf.json')) {
            var regionStageResourcesCfJson = utils.readAndParseJsonSync(file);

            if (cfExtensionPoints.LambdaIamPolicyDocumentStatements.length > 0) {
              JawsCLI.log('Merging in Lambda IAM Policy statements from awsm');
            }
            cfExtensionPoints.LambdaIamPolicyDocumentStatements.forEach(function(policyStmt) {
              regionStageResourcesCfJson.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
            });

            if (cfExtensionPoints.ApiGatewayIamPolicyDocumentStatements.length > 0) {
              JawsCLI.log('Merging in API Gateway IAM Policy statements from awsm');
            }
            cfExtensionPoints.ApiGatewayIamPolicyDocumentStatements.forEach(function(policyStmt) {
              regionStageResourcesCfJson.Resources.IamPolicyApiGateway.Properties.PolicyDocument.Statement.push(policyStmt);
            });

            var cfResourceKeys = Object.keys(cfExtensionPoints.Resources);

            if (cfResourceKeys.length > 0) {
              JawsCLI.log('Merging in CF Resources from awsm');
            }
            cfResourceKeys.forEach(function(resourceKey) {
              if (regionStageResourcesCfJson.Resources[resourceKey]) {
                JawsCLI.log(
                    chalk.bgYellow.white(' WARN ') +
                    chalk.magenta(' Resource key ' + resourceKey + ' already defined in ' + file + '. Overwriting...')
                );
              }

              regionStageResourcesCfJson.Resources[resourceKey] = cfExtensionPoints.Resources[resourceKey];
            });

            utils.writeFile(file, JSON.stringify(regionStageResourcesCfJson, null, 2));
          }
        });
      });
});
