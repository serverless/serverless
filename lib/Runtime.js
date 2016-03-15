'use strict';

const SError     = require('./Error'),
  BbPromise    = require('bluebird'),
  fs           = require('fs'),
  fse          = BbPromise.promisifyAll(require('fs-extra')),
  path         = require('path'),
  wrench       = require('wrench'),
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

    run(func, stage, region) {
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
      return BbPromise.try(() => {
        // Status
        S.utils.sDebug(`"${stage} - ${region} - ${func.getName()}": Copying in dist dir ${pathDist}`);

        // Extract the root of the lambda package from the handler property
        let handlerFullPath = func.getRootPath(func.handler.split('/')[func.handler.split('/').length - 1]).replace(/\\/g, '/');

        // Check handler is correct
        if (handlerFullPath.indexOf(func.handler) == -1) {
          throw new SError('This function\'s handler is invalid and not in the file system: ' + func.handler);
        }

        let packageRoot = handlerFullPath.replace(func.handler, '');

        return wrench.copyDirSyncRecursive(packageRoot, pathDist, {
          exclude: this._processExcludePatterns(func, pathDist, stage, region)
        });
      });
    }

    /**
     * Install Dependencies
     */

    installDependencies(dir) {
      return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "installDependencies()" method`));
    }

    /**
     * Generate Paths
     * - Generate and return an array of paths of the function
     */

    generatePaths(func, pathDist) {

      let compressPaths = [],
        ignore = ['.DS_Store'],
        stats,
        fullPath;

      // Zip up whatever is in back
      let includePaths = ['.'];

      includePaths.forEach(p => {

        try {
          fullPath = path.resolve(path.join(pathDist, p));
          stats = fs.lstatSync(fullPath);
        } catch (e) {
          console.error('Cant find includePath ', p, e);
          throw e;
        }

        if (stats.isFile()) {

          compressPaths.push({
            name: p,
            path: fullPath
          });

        } else if (stats.isDirectory()) {

          let dirname = path.basename(p);

          wrench
            .readdirSyncRecursive(fullPath)
            .forEach(file => {

              // Ignore certain files
              for (let i = 0; i < ignore.length; i++) {
                if (file.toLowerCase().indexOf(ignore[i]) > -1) return;
              }

              let filePath = path.join(fullPath, file);
              if (fs.lstatSync(filePath).isFile()) {

                let pathInZip = path.join(dirname, file);

                compressPaths.push({
                  name: pathInZip,
                  path: filePath
                });
              }
            });
        }
      });

      return BbPromise.resolve(compressPaths);
    }

    /**
     * Process Exclude Patterns
     * - Process exclude patterns in function.custom.excludePatterns
     */

    _processExcludePatterns(func, pathDist, stage, region) {
      // Copy entire test project to temp folder, don't include anything in excludePatterns
      let excludePatterns = func.custom.excludePatterns || [];

      excludePatterns = excludePatterns.concat(['_meta', 'admin.env', '.env']);

      return function (name, prefix) {

        if (!excludePatterns.length) {
          return false;
        }

        let relPath = path.join(prefix.replace(pathDist, ''), name);

        return excludePatterns.some(sRegex => {
          relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

          let re = new RegExp(sRegex),
            matches = re.exec(relPath),
            willExclude = (matches && matches.length > 0);

          if (willExclude) {
            S.utils.sDebug(`"${stage} - ${region} - ${func.name}": Excluding - ${relPath}`);
          }

          return willExclude;
        });
      }
    }
  }

  return Runtime;
};
