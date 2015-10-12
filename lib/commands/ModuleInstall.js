'use strict';

/**
 * JAWS Command: install
 * - Fetches an jaws-module from another github repo and installs it locally
 */
const ProjectCmd = require('./ProjectCmd.js'),
    JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    JawsCLI = require('../utils/cli'),
    utils = require('../utils'),
    path = require('path'),
    URL = require('url'),
    Download = require('download');

let fs = require('fs'),
    wrench = require('wrench'),
    URL = require('url'),
    temp = require('temp');

Promise.promisifyAll(fs);
Promise.promisifyAll(temp);
Promise.promisifyAll(wrench);

temp.track();

const CMD = class ModuleCreate extends ProjectCmd {
  constructor(JAWS, url, saveCf, delExisting, dontInstallDep) {
    super(JAWS);
    this._url = url;
    this._saveCf = saveCf;
    this._dontInstallDep = dontInstallDep;
    this._delExisting = (delExisting === true);
  }

  run() {
    let _this = this;

    return this._JAWS.validateProject()
        .bind(_this)
        .then(_this._downloadMod)
        .then(_this._installFiles)
        .then(module => {
          if (_this._saveCf) {
            return _this._saveCfTemplate(module.path).then(() => module);
          } else {
            return module;
          }
        })
        .then(module => {
          JawsCLI.log('Successfully installed ' + module.name);

          let deferredDepInstalls = [];

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
  }

  /**
   * Download and extract awsm
   *
   * @returns {Promise} tempDirPath
   * @private
   */
  _downloadMod() {
    let _this = this,
        spinner = JawsCLI.spinner(),
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
      return Promise.reject(new JawsError(
          'Must be a github url in this format: https://github.com/jaws-framework/JAWS',
          JawsError.errorCodes.UNKNOWN
      ));
    }

    let downloadUrl = 'https://github.com/' + repo.owner + '/' + repo.repo + '/archive/' + repo.branch + '.zip';

    return temp.mkdirAsync('awsm')
        .then(tempDirPath => {
          return new Promise(function(resolve, reject) {
            utils.jawsDebug(`Downloading awsm to ${tempDirPath}`);
            JawsCLI.log('Downloading aws-module ...');
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
                    reject(new JawsError(`Module Download and installation failed: ${error}`, JawsError.errorCodes.UNKNOWN));
                  }

                  resolve(tempDirPath);
                });
          });
        });
  }

  /**
   *
   * @param tempDirPath
   * @returns {Promise} object {name: awsmJson.name, path: targetModPath}
   * @private
   */
  _installFiles(tempDirPath) {
    let _this = this,
        srcAwsmJsonPath = path.join(tempDirPath, 'awsm.json'),
        awsModsPath = path.join(_this._JAWS._meta.projectRootPath, 'aws_modules');

    if (!utils.fileExistsSync(srcAwsmJsonPath)) {
      return Promise.reject(new JawsError('Module missing awsm.json file in root of project', JawsError.errorCodes.UNKNOWN));
    }

    let awsmJson = utils.readAndParseJsonSync(srcAwsmJsonPath);
    if (!awsmJson.name) {
      return Promise.reject(new JawsError('awsm.json for module missing name attr', JawsError.errorCodes.UNKNOWN));
    }

    let targetModPath = path.join(awsModsPath, awsmJson.name);
    if (!_this._delExisting && utils.dirExistsSync(targetModPath)) {
      return Promise.reject(new JawsError('Module named ' + awsmJson.name + ' already exists in your project', JawsError.errorCodes.UNKNOWN));
    }

    if (
        (!awsmJson.resources) || (!awsmJson.resources.cloudFormation) ||
        (!awsmJson.resources.cloudFormation.LambdaIamPolicyDocumentStatements) ||
        (!awsmJson.resources.cloudFormation.ApiGatewayIamPolicyDocumentStatements)
    ) {
      return Promise.reject(new JawsError('Module does not have required cloudFormation attributes', JawsError.errorCodes.UNKNOWN));
    }

    //Things look good, copy over to proj
    wrench.copyDirSyncRecursive(tempDirPath, targetModPath, {
      forceDelete: _this._delExisting,
      excludeHiddenUnix: false,
    });

    return Promise.reslove({name: awsmJson.name, path: targetModPath});
  }

  /**
   * Save CloudFormation attrs
   *
   * @param modPath path to the newly installed module
   * @returns {Promise}
   */
  _saveCfTemplate(modPath) {
    let awsmJson = utils.readAndParseJsonSync(path.join(modPath, 'awsm.json')),
        projectCfPath = path.join(this._JAWS._meta.projectRootPath, 'cloudformation');

    let cfExtensionPoints = awsmJson.resources.cloudFormation;

    if (!utils.dirExistsSync(projectCfPath)) {
      return Promise.reject(new JawsError('Your project has no cloudformation dir', JawsError.errorCodes.UNKNOWN));
    }

    //Update every resources-cf.json for every stage and region. Deep breath...
    return new Promise(function(resolve, reject) {
      resolve(wrench.readdirSyncRecursive(projectCfPath))
    })
        .then(function(files) {
          files.forEach(file => {
            file = path.join(projectCfPath, file);
            if (utils.endsWith(file, 'resources-cf.json')) {
              let regionStageResourcesCfJson = utils.readAndParseJsonSync(file);

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

              let cfResourceKeys = Object.keys(cfExtensionPoints.Resources);

              if (cfResourceKeys.length > 0) {
                JawsCLI.log('Merging in CF Resources from awsm');
              }
              cfResourceKeys.forEach(resourceKey => {
                if (regionStageResourcesCfJson.Resources[resourceKey]) {
                  throw new JawsError(
                      `Resource key ${resourceKey} already defined in ${file}`,
                      JawsError.errorCodes.UNKNOWN
                  );
                }

                regionStageResourcesCfJson.Resources[resourceKey] = cfExtensionPoints.Resources[resourceKey];
              });

              utils.writeFile(file, JSON.stringify(regionStageResourcesCfJson, null, 2));
            }
          });
        });
  }
};

/**************************************
 * EXPORTS
 **************************************/
module.exports.install = function(JAWS, url, saveCf, dontInstallDep) {
  let command = new CMD(JAWS, url, saveCf, false, dontInstallDep);
  return command.run();
};

module.exports.update = function(JAWS, url, saveCf, dontInstallDep) {
  let command = new CMD(JAWS, url, saveCf, true, dontInstallDep);
  return command.run();
};

exports.ModuleInstall = CMD;