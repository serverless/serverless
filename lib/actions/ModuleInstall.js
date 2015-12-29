'use strict';

/**
 * Action: ModuleInstall
 * - downloads module from github url
 * - validate downloaded module
 * - copy downloaded module into project module dir and install deps
 * - update project CF template
 *
 * Event Properties:
 * - github-url:     (String) github url of the module in this format:
 *                                 https://github.com/serverless/serverless
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    chalk      = require('chalk'),
    URL        = require('url'),
    Download   = require('download'),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils'));

  let fs         = require('fs'),
      wrench     = require('wrench'),
      temp       = require('temp');

  BbPromise.promisifyAll(fs);
  BbPromise.promisifyAll(temp);
  BbPromise.promisifyAll(wrench);

  temp.track();


  /**
   * ModuleInstall Class
   */

  class ModuleInstall extends SPlugin {

    constructor(S, config) {
      super(S, config);
      this.evt = {};
    }

    static getName() {
      return 'serverless.core.' + ModuleInstall.name;
    }

    registerActions() {
      this.S.addAction(this.moduleInstall.bind(this), {
        handler:       'moduleInstall',
        description:   `Downloads and installs a new module from github.
usage: serverless module install <github-url>`,
        context:       'module',
        contextAction: 'install',
        options:       [],
      });
      return BbPromise.resolve();
    }


    /**
     * Action
     */

    moduleInstall(evt) {

      let _this = this;

      if(evt) {
        _this.evt = evt;
      }

      // If CLI, parse param
      if (_this.S.cli) {
        _this.evt.url = this.S.cli.params[0];
      }

      return _this._downloadModule()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._installModule)
          .then(_this._updateCfTemplate)
          .then(function() {
            SCli.log('Successfully installed ' + _this.evt.module.name + ' module.');
            return _this.evt;
          });
    }


    /**
     * Downloads the module from github
     */

    _downloadModule() {
      // If URL is not provided, throw error.
      if(!this.evt.url) {
        return BbPromise.reject(new SError('Github URL is required. (eg. serverless module install <github-url>)', SError.errorCodes.UNKNOWN));
      }

      let _this = this,
          spinner = SCli.spinner(),
          url = URL.parse(_this.evt.url),
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
        return BbPromise.reject(new SError('Must be a github url in this format: https://github.com/serverless/serverless', SError.errorCodes.UNKNOWN));
      }

      let downloadUrl = 'https://github.com/' + repo.owner + '/' + repo.repo + '/archive/' + repo.branch + '.zip';

      return temp.mkdirAsync('module')
          .then(function(tempModulePath) {
            return new BbPromise(function(resolve, reject) {
              SCli.log('Downloading module ...');
              spinner.start();

              new Download({
                timeout: 30000,
                extract: true,
                strip: 1,
                mode: '755',
              }).get(downloadUrl)
                .dest(tempModulePath)
                .run(function(error) {
                  spinner.stop(true);
                  if (error) {
                    return BbPromise.reject(new SError('Module Download and installation failed: ' + error, SError.errorCodes.UNKNOWN));
                  }
                  _this.evt.pathTempModule = tempModulePath;
                  resolve();
                });
            });
          });
    };

    /**
     * Validate and prepare data before installing the downloaded module
     */

    _validateAndPrepare() {
      let _this = this,
          srcModuleJsonPath = path.join(_this.evt.pathTempModule, 's-module.json');

      // if s-module.json doesn't exist in downloaded module, throw error
      if (!SUtils.fileExistsSync(srcModuleJsonPath)) {
        return BbPromise.reject(new SError('Missing s-module.json file in module root', SError.errorCodes.UNKNOWN));
      }

      let srcModuleJson = SUtils.readAndParseJsonSync(srcModuleJsonPath);

      // if name is missing from s-module.json, throw error
      if (!srcModuleJson.name) {
        return BbPromise.reject(new SError('s-module.json for downloaded module missing name attr', SError.errorCodes.UNKNOWN));
      }

      _this.evt.module = srcModuleJson;

      _this.evt.module.pathModule = path.join(this.S._projectRootPath, 'back', 'modules', srcModuleJson.name);

      // if same module name exists, throw error
      if (SUtils.dirExistsSync(_this.evt.module.pathModule)) {
        return BbPromise.reject(new SError(
            'module ' + srcModuleJson.name + ' already exists',
            SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      // if required cloudformation attrs are missing, throw error
      if (
          (!srcModuleJson.cloudFormation) ||
          (!srcModuleJson.cloudFormation.lambdaIamPolicyDocumentStatements)
         ) {
           return BbPromise.reject(new SError('Module does not have required cloudFormation attributes', SError.errorCodes.UNKNOWN));
      }

      return BbPromise.resolve();
    };


    /**
     * Installs the downloaded module
     */

    _installModule() {
      let _this = this;

      // all good! copy/install module
      wrench.copyDirSyncRecursive(_this.evt.pathTempModule, _this.evt.module.pathModule, {
        forceDelete: true,
        excludeHiddenUnix: false,
      });

      // install deps if package.json exists
      if (SUtils.fileExistsSync(path.join(_this.evt.module.pathModule, 'package.json'))) {
        SUtils.npmInstall(_this.evt.module.pathModule);
      }

      return BbPromise.resolve();
    };


    /**
     * Copy CF resources to the project CF template
     */

    _updateCfTemplate() {

      let _this             = this,
          projectCfPath     = path.join(_this.S._projectRootPath, 'cloudformation'),
          cfExtensionPoints = SUtils.readAndParseJsonSync(path.join(_this.evt.pathTempModule, 's-module.json')).cloudFormation;

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
    };
  }

  return( ModuleInstall );
};
