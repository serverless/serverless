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
    temp = require('temp');

Promise.promisifyAll(fs);
Promise.promisifyAll(temp);
Promise.promisifyAll(wrench);

temp.track();

module.exports.run = function(JAWS, moduleName, packageManager) {
  var command = new CMD(JAWS, moduleName, packageManager);
  return command.run();
};

function CMD(JAWS, moduleName, packageManager) {
  this._JAWS = JAWS;
  this._module = moduleName;
  this._packageManager = packageManager;
}

CMD.prototype.constructor = CMD;

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._installFiles)
      .then(function(module) {
        if (_this._saveCf) {
          return _this._saveCfTemplate(module.path).then(function() {
            return module;
          });
        } else {
          return module;
        }
      })
      .then(function(module) {
        JawsCLI.log('Successfully installed ' + module.name);

        var deferredDepInstalls = [];

        if (utils.fileExistsSync(path.join(module.path, 'package.json'))) {
          if (_this._dontInstallDep) {
            JawsCLI.log('Make sure to run "npm install" from the module\'s dir');
          } else {
            JawsCLI.log('Installing node dependencies...');
            deferredDepInstalls.push(utils.npmInstall(module.path));
          }
        }

        return Promise.all(deferredDepInstalls);
      });
});

/**
 * Install Files
 *
 * @returns {Promise} object {name: awsmJson.name, path: targetModPath}
 */

CMD.prototype._installFiles = Promise.method(function() {

  var _this = this,
      srcAwsmPath = path.join(_this._JAWS._meta.projectRootPath, 'node_modules', _this._module, 'awsm'),
      srcAwsmJsonPath = path.join(_this._JAWS._meta.projectRootPath, 'node_modules', _this._module, 'awsm.json'),
      awsModsPath = path.join(_this._JAWS._meta.projectRootPath, 'aws_modules');

  if (!utils.fileExistsSync(srcAwsmJsonPath)) {
    throw new JawsError('Module missing awsm.json file in root of project', JawsError.errorCodes.UNKNOWN);
  }

  var awsmJson = utils.readAndParseJsonSync(srcAwsmJsonPath);

  if (!awsmJson.name) {
    throw new JawsError('awsm.json for module missing name attr', JawsError.errorCodes.UNKNOWN);
  }

  var targetModPath = path.join(awsModsPath, awsmJson.name);

  if (!_this._delExisting && utils.dirExistsSync(targetModPath)) {
    throw new JawsError('Modlue named ' + awsmJson.name + ' already exists in your project', JawsError.errorCodes.UNKNOWN);
  }

  if (
      (!awsmJson.resources) || (!awsmJson.resources.cloudFormation) ||
      (!awsmJson.resources.cloudFormation.LambdaIamPolicyDocumentStatements) ||
      (!awsmJson.resources.cloudFormation.ApiGatewayIamPolicyDocumentStatements)
  ) {
    throw new JawsError('Module does not have required cloudFormation attributes', JawsError.errorCodes.UNKNOWN);
  }

  // Things look good, copy over to proj
  wrench.copyDirSyncRecursive(
      srcAwsmPath,
      targetModPath, {
    forceDelete: _this._delExisting,
    excludeHiddenUnix: false,
  });

  return {name: awsmJson.name, path: targetModPath};
});

/**
 * Save CloudFormation attrs
 *
 * @param modPath path to the newly installed module
 * @returns {Promise}
 */
CMD.prototype._saveCfTemplate = Promise.method(function(modPath) {
  var awsmJson = utils.readAndParseJsonSync(path.join(modPath, 'awsm.json')),
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
                throw new JawsError(
                    'Resource key ' + resourceKey + ' already defined in ' + file,
                    JawsError.errorCodes.UNKNOWN
                );
              }

              regionStageResourcesCfJson.Resources[resourceKey] = cfExtensionPoints.Resources[resourceKey];
            });

            utils.writeFile(file, JSON.stringify(regionStageResourcesCfJson, null, 2));
          }
        });
      });
});
