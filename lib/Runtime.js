'use strict';

const SError     = require('./Error'),
  BbPromise    = require('bluebird'),
  fs           = require('fs'),
  fse          = BbPromise.promisifyAll(require('fs-extra')),
  path         = require('path'),
  _            = require('lodash');

module.exports = function(S) {

  class Runtime {

    constructor() {}

    static getName() {
      return null;
    }

    /**
     * Scaffold
     * - Scaffold the function in this runtime
     */

    scaffold(func) {
      return BbPromise.resolve();
    }

    /**
     * Run
     * - Run the function in this runtime
     */

    run(func, stage, region, event) {
      return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "run()" method`));
    }

    /**
     * Build
     * - Build the function in this runtime
     */

    build(func, stage, region) {
      return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "build()" method`));
    }

    /**
     * Get ENV Vars
     * - Gets ENV vars for this function and sets some defaults
     */

    getEnvVars(func, stage, region) {

      const envVars = func.toObjectPopulated({stage, region}).environment,
        project = S.getProject();

      const defaultVars = {
        SERVERLESS_PROJECT: project.getName(),
        SERVERLESS_STAGE: stage,
        SERVERLESS_REGION: region,
        SERVERLESS_DATA_MODEL_STAGE: stage ? project.getStage(stage).getName() : stage
      };

      return BbPromise.resolve(_.defaults(defaultVars, envVars));
    }

    /**
     * Create Dist Dir
     * - Creates a distribution folder for this function in _meta/_tmp
     */

    createDistDir(funcName) {

      let d = new Date(),
        pathDist = S.getProject().getRootPath('_meta', '_tmp', funcName + '@' + d.getTime());

      return new BbPromise(function (resolve, reject) {
        try {
          fse.mkdirsSync(path.dirname(pathDist));
        } catch (e) {
          reject(new SError(`Error creating parent folders when writing this file: ${pathDist}
      ${e.message}`));
        }

        resolve(pathDist);
      });
    }

    /**
     * Copy Function
     * - Copies function to dist dir
     */

    copyFunction(func, pathDist, stage, region) {
      // Status
      S.utils.sDebug(`"${stage} - ${region} - ${func.getName()}": Copying in dist dir ${pathDist}`);

      // Extract the root of the lambda package from the handler property
      let handlerFullPath = func.getRootPath(_.last(func.handler.split('/'))).replace(/\\/g, '/');

      // Check handler is correct
      if (!handlerFullPath.endsWith(func.handler)) {
        return BbPromise.reject(new SError(`This function's handler is invalid and not in the file system: ` + func.handler));
      }

      let packageRoot = handlerFullPath.replace(func.handler, '');

      return fse.copyAsync(packageRoot, pathDist, {
        filter: this._processExcludePatterns(func, pathDist, stage, region),
        dereference: true
      });
    }

    /**
     * Install Dependencies
     */

    installDependencies(dir) {
      return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "installDependencies()" method`));
    }

    /**
     * Process Exclude Patterns
     * - Process exclude patterns in function.custom.excludePatterns
     */

    _processExcludePatterns(func, pathDist, stage, region) {
      // Copy entire test project to temp folder, don't include anything in excludePatterns
      let excludePatterns = func.custom.excludePatterns || [];
      let pathToMeta = func.getProject().getRootPath('_meta').substr(1)

      excludePatterns = excludePatterns.concat([pathToMeta, path.sep + 'admin\.env$', path.sep + '\.env$']);

      return function (filePath) {

        if (!excludePatterns.length) {
          return false;
        }

        filePath = (filePath.charAt(0) == path.sep) ? filePath.substr(1) : filePath;

        // if return true FS extra will NOT exclude, if false, FS extra will exclude
        return !excludePatterns.some(sRegex => {
          let re = new RegExp(sRegex),
            matches = re.exec(filePath),
            willExclude = matches && matches.length > 0;

          if (willExclude) {
            S.utils.sDebug(`"${stage} - ${region} - ${func.name}": Excluding - ${filePath}`);
          }

          return willExclude;
        });
      }
    }
  }

  return Runtime;
};
