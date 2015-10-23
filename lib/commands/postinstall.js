'use strict';

/**
 * JAWS Command: postinstall
 * - Performs automation after an aws-module is installed via a package manager
 */

const ProjectCmd = require('./ProjectCmd.js'),
      JawsError  = require('../jaws-error'),
      Promise    = require('bluebird'),
      JawsCLI    = require('../utils/cli'),
      utils      = require('../utils'),
      path       = require('path'),
      chalk      = require('chalk');

let fs     = require('fs'),
    wrench = require('wrench'),
    temp   = require('temp');

Promise.promisifyAll(fs);
Promise.promisifyAll(temp);
Promise.promisifyAll(wrench);

temp.track();

const CMD = class Postinstall extends ProjectCmd {
  constructor(JAWS, moduleName, packageManager) {
    super(JAWS);
    if (['npm'].indexOf(packageManager) == -1) {
      return Promise.reject(new JawsError('Unsupported package manager', JawsError.errorCodes.UNKNOWN));
    }
    this._moduleName     = moduleName;
    this._packageManager = packageManager;
    this._rootAwsmJson   = {};
  }

  run() {
    let _this = this;

    // Skip when using "npm link"
    if (!utils.fileExistsSync(path.join(process.cwd(), 'jaws.json'))) {
      switch (_this._packageManager) {
        case 'npm':
          if (!utils.fileExistsSync(path.join(process.cwd(), '..', '..', 'jaws.json'))) {
            JawsCLI.log('Skipping postinstall...');
            return Promise.resolve();
          }
          break;
      }
    }

    return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._installFiles)
      .then(function(module) {
        return Promise.all([module, _this._saveCfTemplate(module.path)]);
      })
      .spread(function(module) {
        let deferredDepInstalls = [];

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
        return utils.findAllEnvletsForAwsm(_this._JAWS._projectRootPath, _this._moduleName);
      })
      .then(function(envlets) {
        JawsCLI.log('Successfully installed ' + _this._moduleName);

        if (envlets && envlets.length > 1) {
          JawsCLI.log(
            chalk.bgYellow.white(' WARN ') +
            chalk.magenta(' This aws module uses env lets MAKE SURE to run jaws env list to see which ones need to be set')
          );
        }
      });
  }

  /**
   *
   * @returns {Promise} object {name: awsmJson.name, path: targetModPath}
   * @private
   */
  _installFiles() {

    let _this = this,
        pkgMgrDir;

    if (_this._packageManager == 'npm') {
      pkgMgrDir = 'node_modules';
    }

    let srcAwsmPath     = path.join(_this._JAWS._projectRootPath, pkgMgrDir, _this._moduleName, 'awsm'),
        srcAwsmJsonPath = path.join(_this._JAWS._projectRootPath, pkgMgrDir, _this._moduleName, 'awsm.json'),
        awsModsPath     = path.join(_this._JAWS._projectRootPath, 'aws_modules');

    if (!utils.fileExistsSync(srcAwsmJsonPath)) {
      return Promise.reject(new JawsError('Module missing awsm.json file in root of project', JawsError.errorCodes.UNKNOWN));
    }

    let awsmJson        = utils.readAndParseJsonSync(srcAwsmJsonPath);
    _this._rootAwsmJson = awsmJson;

    if (!awsmJson.name) {
      return Promise.reject(new JawsError('awsm.json for module missing name attr', JawsError.errorCodes.UNKNOWN));
    }

    let targetModPath = path.join(awsModsPath, awsmJson.name);

    if (!_this._delExisting && utils.dirExistsSync(targetModPath)) {
      return Promise.reject(new JawsError('Module named ' + awsmJson.name + ' already exists in your project', JawsError.errorCodes.UNKNOWN));
    }

    if (
      (!awsmJson.cloudFormation) ||
      (!awsmJson.cloudFormation.lambdaIamPolicyDocumentStatements) ||
      (!awsmJson.cloudFormation.apiGatewayIamPolicyDocumentStatements)
    ) {
      return Promise.reject(new JawsError('Module does not have required cloudFormation attributes', JawsError.errorCodes.UNKNOWN));
    }

    //Copy over jaws awsm scaffolding
    JawsCLI.log(`Copying ${srcAwsmPath} to ${targetModPath}`);
    wrench.copyDirSyncRecursive(
      srcAwsmPath,
      targetModPath, {
        forceDelete:       true,
        excludeHiddenUnix: false,
      });

    //Write mod root awsm.json so we can identify awsm dirs later
    return utils.writeFile(path.join(targetModPath, 'awsm.json'), JSON.stringify(awsmJson, null, 2))
      .then(function() {
        return {name: awsmJson.name, path: targetModPath};
      });
  }

  /**
   * Save CloudFormation attrs
   *
   * @returns {Promise}
   * @private
   */
  _saveCfTemplate() {
    let _this         = this,
        awsmJson      = _this._rootAwsmJson,
        projectCfPath = path.join(this._JAWS._projectRootPath, 'cloudformation');

    let cfExtensionPoints = awsmJson.cloudFormation;

    if (!utils.dirExistsSync(projectCfPath)) {
      return Promise.reject(new JawsError('Your project has no cloudformation dir', JawsError.errorCodes.UNKNOWN));
    }

    //Update every resources-cf.json for every stage and region. Deep breath...
    return new Promise(function(resolve, reject) {
      resolve(wrench.readdirSyncRecursive(projectCfPath))
    })
      .then(function(files) {
        files.forEach(function(file) {
          file = path.join(projectCfPath, file);
          if (utils.endsWith(file, 'resources-cf.json')) {
            let regionStageResourcesCfJson = utils.readAndParseJsonSync(file);

            if (cfExtensionPoints.lambdaIamPolicyDocumentStatements.length > 0) {
              JawsCLI.log('Merging in Lambda IAM Policy statements from awsm');
            }
            cfExtensionPoints.lambdaIamPolicyDocumentStatements.forEach(function(policyStmt) {
              regionStageResourcesCfJson.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
            });

            if (cfExtensionPoints.apiGatewayIamPolicyDocumentStatements.length > 0) {
              JawsCLI.log('Merging in API Gateway IAM Policy statements from awsm');
            }
            cfExtensionPoints.apiGatewayIamPolicyDocumentStatements.forEach(function(policyStmt) {
              regionStageResourcesCfJson.Resources.IamPolicyApiGateway.Properties.PolicyDocument.Statement.push(policyStmt);
            });

            let cfResourceKeys = Object.keys(cfExtensionPoints.resources);

            if (cfResourceKeys.length > 0) {
              JawsCLI.log('Merging in CF Resources from awsm');
            }
            cfResourceKeys.forEach(function(resourceKey) {
              if (regionStageResourcesCfJson.Resources[resourceKey]) {
                JawsCLI.log(
                  chalk.bgYellow.white(' WARN ') +
                  chalk.magenta(` Resource key ${resourceKey} already defined in ${file}. Overwriting...`)
                );
              }

              regionStageResourcesCfJson.Resources[resourceKey] = cfExtensionPoints.resources[resourceKey];
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
module.exports.run = function(JAWS, moduleName, packageManager) {
  let command = new CMD(JAWS, moduleName, packageManager);
  return command.run();
};

module.exports.Postinstall = CMD;
