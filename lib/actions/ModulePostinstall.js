'use strict';

/**
 * Action: Module Postinstall
 */

const SPlugin = require('../ServerlessPlugin'),
      SError  = require('../ServerlessError'),
      SCli    = require('../utils/cli'),
      path       = require('path'),
      BbPromise  = require('bluebird'),
      SUtils  = require('../utils'),
      chalk      = require('chalk');

let fs     = require('fs'),
    wrench = require('wrench'),
    temp   = require('temp');
BbPromise.promisifyAll(fs);

/**
 * StageCreate Class
 */
class ModulePostinstall extends SPlugin {
  
  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }
  
  /**
   * Define your plugins name
   */

  static getName() {
    return 'serverless.core.' + ModulePostinstall.name;
  }
  
  registerActions() {
    this.S.addAction(this.postInstall.bind(this), {
      handler:       'postInstall',
      description:   `copies Module files into project modules directory.
usage: serverless module postinstall <pkgMgr> <moduleName>`,
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
      
      if (_this.S.cli) {
        // Add options to evt
        _this.evt = _this.S.cli.options;
        
        // TODO: validate that resource & action != any of the options, otherwise
        // the option will be replaced with the param in evt
        _this.evt.pkgMgr = _this.S.cli.params[0];
        _this.evt.moduleName   = _this.S.cli.params[1];
      }

      // Skip when using "npm link"
      if (!SUtils.fileExistsSync(path.join(process.cwd(), 's-project.json'))) {
        switch (_this.evt.pkgMgr) {
          case 'npm':
            if (!SUtils.fileExistsSync(path.join(process.cwd(), '..', '..', 's-project.json'))) {
              SCli.log('Skipping postinstall...');
              return BbPromise.resolve();
            }
            break;
        }
      }
      
      return this.S.validateProject()
        .bind(_this)
        .then(_this._installFiles)
        .then(function(module) {
          return BbPromise.all([module, _this._saveCfTemplate(module.path)]);
        })
        .spread(function(module) {
          let deferredDepInstalls = [];

          switch (_this.evt.pkgMgr) {
            case 'npm':
              if (SUtils.fileExistsSync(path.join(module.path, 'package.json'))) {
                deferredDepInstalls.push(SUtils.npmInstall(module.path));
              }
              break;
            default:
              throw new SError('Unsupported package manager', SError.errorCodes.UNKNOWN);
              break;
          }

          if (deferredDepInstalls.length > 0) {
            SCli.log('Installing ' + _this.evt.pkgMgr + ' dependencies...');
          }

          return BbPromise.all(deferredDepInstalls);
        })
        .then(function() {
          return SUtils.findAllEnvletsForAwsm(_this.S._projectRootPath, _this.evt.moduleName);
        })
        .then(function(envlets) {
          SCli.log('Successfully installed ' + _this.evt.moduleName);

          if (envlets && envlets.length > 1) {
            SCli.log(
              chalk.bgYellow.white(' WARN ') +
              chalk.magenta(' This aws module uses env lets MAKE SURE to run serverless env list to see which ones need to be set')
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

      let srcAwsmPath     = path.join(_this.S._projectRootPath, 'back', pkgMgrDir, _this.evt.moduleName, 's-module'),
          srcAwsmJsonPath = path.join(_this.S._projectRootPath, 'back', pkgMgrDir, _this.evt.moduleName, 's-module.json'),
          awsModsPath     = path.join(_this.S._projectRootPath, 'back', 'modules');

      if (!SUtils.fileExistsSync(srcAwsmJsonPath)) {
        return BbPromise.reject(new SError('Module missing s-module.json file in root of project', SError.errorCodes.UNKNOWN));
      }

      let awsmJson        = SUtils.readAndParseJsonSync(srcAwsmJsonPath);
      _this._rootAwsmJson = awsmJson;

      if (!awsmJson.name) {
        return BbPromise.reject(new SError('s-module.json for module missing name attr', SError.errorCodes.UNKNOWN));
      }

      let targetModPath = path.join(awsModsPath, awsmJson.name);

      if (!_this._delExisting && SUtils.dirExistsSync(targetModPath)) {
        return BbPromise.reject(new SError('Module named ' + awsmJson.name + ' already exists in your project', SError.errorCodes.UNKNOWN));
      }

      if (
        (!awsmJson.cloudFormation) ||
        (!awsmJson.cloudFormation.lambdaIamPolicyDocumentStatements) ||
        (!awsmJson.cloudFormation.apiGatewayIamPolicyDocumentStatements)
      ) {
        return BbPromise.reject(new SError('Module does not have required cloudFormation attributes', SError.errorCodes.UNKNOWN));
      }

      //Copy over serverless module scaffolding
      SCli.log(`Copying ${srcAwsmPath} to ${targetModPath}`);
      wrench.copyDirSyncRecursive(
        srcAwsmPath,
        targetModPath, {
          forceDelete:       true,
          excludeHiddenUnix: false,
        });

      //Write mod root s-module.json so we can identify s-module dirs later
      return SUtils.writeFile(path.join(targetModPath, 's-module.json'), JSON.stringify(awsmJson, null, 2))
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
          projectCfPath = path.join(_this.S._projectRootPath, 'cloudformation');

      let cfExtensionPoints = awsmJson.cloudFormation;

      if (!SUtils.dirExistsSync(projectCfPath)) {
        return BbPromise.reject(new SError('Your project has no cloudformation dir', SError.errorCodes.UNKNOWN));
      }

      //Update every resources-cf.json for every stage and region. Deep breath...
      return new BbPromise(function(resolve, reject) {
        resolve(wrench.readdirSyncRecursive(projectCfPath))
      })
        .then(function(files) {
          files.forEach(function(file) {
            
            file = path.join(projectCfPath, file);
            if (SUtils.endsWith(file, 'resources-cf.json')) {
              
              let regionStageResourcesCfJson = SUtils.readAndParseJsonSync(file);

              if (cfExtensionPoints.lambdaIamPolicyDocumentStatements.length > 0) {
                SCli.log('Merging in Lambda IAM Policy statements from s-module');
              }
              cfExtensionPoints.lambdaIamPolicyDocumentStatements.forEach(function(policyStmt) {
                regionStageResourcesCfJson.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
              });

              if (cfExtensionPoints.apiGatewayIamPolicyDocumentStatements.length > 0) {
                SCli.log('Merging in API Gateway IAM Policy statements from s-module');
              }
              cfExtensionPoints.apiGatewayIamPolicyDocumentStatements.forEach(function(policyStmt) {
                regionStageResourcesCfJson.Resources.IamPolicyApiGateway.Properties.PolicyDocument.Statement.push(policyStmt);
              });

              let cfResourceKeys = Object.keys(cfExtensionPoints.resources);

              if (cfResourceKeys.length > 0) {
                SCli.log('Merging in CF Resources from s-module');
              }
              cfResourceKeys.forEach(function(resourceKey) {
                if (regionStageResourcesCfJson.Resources[resourceKey]) {
                  SCli.log(
                    chalk.bgYellow.white(' WARN ') +
                    chalk.magenta(` Resource key ${resourceKey} already defined in ${file}. Overwriting...`)
                  );
                }

                regionStageResourcesCfJson.Resources[resourceKey] = cfExtensionPoints.resources[resourceKey];
              });
              
              SUtils.writeFile(file, JSON.stringify(regionStageResourcesCfJson, null, 2));
            }
          });
        });
    }

}

module.exports = ModulePostinstall;
