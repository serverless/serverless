'use strict';

/**
 * JAWS Command: install
 * - Fetches an jaws-module from another github repo and installs it locally
 */
var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    JawsCLI = require('../utils/cli'),
    utils = require('../utils'),
    path = require('path'),
    fs = require('fs'),
    wrench = require('wrench'),
    URL = require('url'),
    temp = require('temp'),
    Download = require('download');

Promise.promisifyAll(fs);
Promise.promisifyAll(temp);
Promise.promisifyAll(wrench);

temp.track();

module.exports.install = function(JAWS, url, saveCf, dontInstallDep) {
  var command = new CMD(JAWS, url, saveCf, false, dontInstallDep);
  return command.run();
};

module.exports.update = function(JAWS, url, saveCf, dontInstallDep) {
  var command = new CMD(JAWS, url, saveCf, true, dontInstallDep);
  return command.run();
};

function CMD(JAWS, url, saveCf, delExisting, dontInstallDep) {
  this._JAWS = JAWS;
  this._url = url;
  this._saveCf = saveCf;
  this._dontInstallDep = dontInstallDep;
  this._delExisting = (delExisting === true);
}

CMD.prototype.constructor = CMD;

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._downloadMod)
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
 * Download and extract awsm
 *
 * @returns {Promise} tempDirPath
 */

CMD.prototype._downloadMod = Promise.method(function() {
  var _this = this,
      spinner = JawsCLI.spinner('Downloading aws-module ...'),
      url = URL.parse(_this._url),
      parts = url.pathname.split('/'),
      repo = {
        owner: parts[1],
        repo: parts[2],
        branch: 'master'
      };

  //TODO: support github tree URLS (branch): https://github.com/jaws-framework/JAWS/tree/cf-deploy
  if (~repo.repo.indexOf('#')) {
    url[2].split('#');
    repo.repo = url[2].split('#')[0];
    repo.branch = url[2].split('#')[1];
  }

  if (url.hostname !== 'github.com' || !repo.owner || !repo.repo) {
    spinner.stop(true);
    throw new JawsError(
        'Must be a github url in this format: https://github.com/jaws-framework/JAWS',
        JawsError.errorCodes.UNKNOWN
    );
  }

  var downloadUrl = 'https://github.com/' + repo.owner + '/' + repo.repo + '/archive/' + repo.branch + '.zip';

  return temp.mkdirAsync('awsm')
      .then(function(tempDirPath) {
        return new Promise(function(resolve, reject) {
          utils.logIfVerbose('Downloading awsm to ' + tempDirPath);
          spinner.start();

          new Download({
            timeout: 30000,
            extract: true,
            strip: 1,
            mode: '755',
          })
              .get(downloadUrl)
              .dest(tempDirPath)
              .run(function(error) {
                spinner.stop(true);

                if (error) {
                  reject(new JawsError('Module Download and installation failed: ' + error, JawsError.errorCodes.UNKNOWN));
                }

                resolve(tempDirPath);
              });
        });
      });
});

/**
 * Install Files
 *
 * @returns {Promise} object {name: awsmJson.name, path: targetModPath}
 */

CMD.prototype._installFiles = Promise.method(function(tempDirPath) {
  var _this = this,
      srcAwsmJsonPath = path.join(tempDirPath, 'awsm.json'),
      awsModsPath = path.join(_this._JAWS._meta.projectRootPath, 'back', 'aws_modules');

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

  //Things look good, copy over to proj
  wrench.copyDirSyncRecursive(tempDirPath, targetModPath, {
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
  return wrench.readdirRecursiveAsync(projectCfPath)
      .then(function(files) {
        files.forEach(function(file) {
          if (utils.endsWith(file, 'resources-cf.json')) {
            var regionStageResourcesCfJson = utils.readAndParseJsonSync(file);

            cfExtensionPoints.LambdaIamPolicyDocumentStatements.forEach(function(policyStmt) {
              regionStageResourcesCfJson.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
            });

            cfExtensionPoints.ApiGatewayIamPolicyDocumentStatements.forEach(function(policyStmt) {
              regionStageResourcesCfJson.IamPolicyApiGateway.Properties.PolicyDocument.Statement.push(policyStmt);
            });

            Object.keys(cfExtensionPoints.Resources).forEach(function(resourceKey) {
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