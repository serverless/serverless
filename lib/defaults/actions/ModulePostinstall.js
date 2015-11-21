'use strict';

/**
 * Action: Module Postinstall
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      BbPromise  = require('bluebird'),
      JawsUtils  = require('../../utils'),
      chalk      = require('chalk');

let fs     = require('fs'),
    wrench = require('wrench'),
    temp   = require('temp');
BbPromise.promisifyAll(fs);

/**
 * StageCreate Class
 */
class ModulePostinstall extends JawsPlugin {
  
  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }
  
  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + ModulePostinstall.name;
  }
  
  registerActions() {
    this.Jaws.addAction(this.postInstall.bind(this), {
      handler:       'postInstall',
      description:   `copies AWSM files into project aws-modules directory. 
usage: jaws module postinstall <pkgMgr> <moduleName>`,
      context:       'module',
      contextAction: 'postinstall',
      options:       [],
    });
    return BbPromise.resolve();
  }
  
  
    /**
     *
     * @param noExeCf
     * @param region
     * @param stage
     * @returns {Promise}
     */
    postInstall(evt) {
      let _this = this;
      _this.evt = evt;
      
      if (_this.Jaws.cli) {
        // Add options to evt
        _this.evt = _this.Jaws.cli.options;
        
        // TODO: validate that resource & action != any of the options, otherwise
        // the option will be replaced with the param in evt
        _this.evt.pkgMgr = _this.Jaws.cli.params[0];
        _this.evt.moduleName   = _this.Jaws.cli.params[1];
      }

      // Skip when using "npm link"
      if (!JawsUtils.fileExistsSync(path.join(process.cwd(), 'jaws.json'))) {
        switch (_this.evt.pkgMgr) {
          case 'npm':
            if (!JawsUtils.fileExistsSync(path.join(process.cwd(), '..', '..', 'jaws.json'))) {
              JawsCLI.log('Skipping postinstall...');
              return BbPromise.resolve();
            }
            break;
        }
      }
      
      return this.Jaws.validateProject()
        .bind(_this)
        .then(_this._installFiles)
        .then(function(module) {
          return BbPromise.all([module, _this._saveCfTemplate(module.path)]);
        })
        .spread(function(module) {
          let deferredDepInstalls = [];

          switch (_this.evt.pkgMgr) {
            case 'npm':
              if (JawsUtils.fileExistsSync(path.join(module.path, 'package.json'))) {
                deferredDepInstalls.push(JawsUtils.npmInstall(module.path));
              }
              break;
            default:
              throw new JawsError('Unsupported package manager', JawsError.errorCodes.UNKNOWN);
              break;
          }

          if (deferredDepInstalls.length > 0) {
            JawsCLI.log('Installing ' + _this.evt.pkgMgr + ' dependencies...');
          }

          return BbPromise.all(deferredDepInstalls);
        })
        .then(function() {
          return JawsUtils.findAllEnvletsForAwsm(_this.Jaws._projectRootPath, _this.evt.moduleName);
        })
        .then(function(envlets) {
          JawsCLI.log('Successfully installed ' + _this.evt.moduleName);

          if (envlets && envlets.length > 1) {
            JawsCLI.log(
              chalk.bgYellow.white(' WARN ') +
              chalk.magenta(' This aws module uses env lets MAKE SURE to run jaws env list to see which ones need to be set')
            );
          }
        });
    };
    
    /**
     *
     * @returns {Promise} object {name: awsmJson.name, path: targetModPath}
     * @private
     */
    _installFiles() {

      let _this = this,
          pkgMgrDir;

      if (_this.evt.pkgMgr == 'npm') {
        pkgMgrDir = 'node_modules';
      }

      let srcAwsmPath     = path.join(_this.Jaws._projectRootPath, pkgMgrDir, _this.evt.moduleName, 'awsm'),
          srcAwsmJsonPath = path.join(_this.Jaws._projectRootPath, pkgMgrDir, _this.evt.moduleName, 'awsm.json'),
          awsModsPath     = path.join(_this.Jaws._projectRootPath, 'slss_modules');

      if (!JawsUtils.fileExistsSync(srcAwsmJsonPath)) {
        return BbPromise.reject(new JawsError('Module missing awsm.json file in root of project', JawsError.errorCodes.UNKNOWN));
      }

      let awsmJson        = JawsUtils.readAndParseJsonSync(srcAwsmJsonPath);
      _this._rootAwsmJson = awsmJson;

      if (!awsmJson.name) {
        return BbPromise.reject(new JawsError('awsm.json for module missing name attr', JawsError.errorCodes.UNKNOWN));
      }

      let targetModPath = path.join(awsModsPath, awsmJson.name);

      if (!_this._delExisting && JawsUtils.dirExistsSync(targetModPath)) {
        return BbPromise.reject(new JawsError('Module named ' + awsmJson.name + ' already exists in your project', JawsError.errorCodes.UNKNOWN));
      }

      if (
        (!awsmJson.cloudFormation) ||
        (!awsmJson.cloudFormation.lambdaIamPolicyDocumentStatements) ||
        (!awsmJson.cloudFormation.apiGatewayIamPolicyDocumentStatements)
      ) {
        return BbPromise.reject(new JawsError('Module does not have required cloudFormation attributes', JawsError.errorCodes.UNKNOWN));
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
      return JawsUtils.writeFile(path.join(targetModPath, 'awsm.json'), JSON.stringify(awsmJson, null, 2))
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
          projectCfPath = path.join(_this.Jaws._projectRootPath, 'cloudformation');

      let cfExtensionPoints = awsmJson.cloudFormation;

      if (!JawsUtils.dirExistsSync(projectCfPath)) {
        return BbPromise.reject(new JawsError('Your project has no cloudformation dir', JawsError.errorCodes.UNKNOWN));
      }

      //Update every resources-cf.json for every stage and region. Deep breath...
      return new BbPromise(function(resolve, reject) {
        resolve(wrench.readdirSyncRecursive(projectCfPath))
      })
        .then(function(files) {
          files.forEach(function(file) {
            file = path.join(projectCfPath, file);
            if (JawsUtils.endsWith(file, 'resources-cf.json')) {
              
              let regionStageResourcesCfJson = JawsUtils.readAndParseJsonSync(file);

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

              JawsUtils.writeFile(file, JSON.stringify(regionStageResourcesCfJson, null, 2));
            }
          });
        });
    }

}

module.exports = ModulePostinstall;
