'use strict';

const SError     = require('./Error'),
  BbPromise    = require('bluebird'),
  fs           = BbPromise.promisifyAll(require('fs')),
  path         = require('path'),
  wrench       = require('wrench');

/**
 * This is the base class that all Serverless Runtimes should extend.
 */


let SUtils;

class ServerlessRuntimeBase {
  constructor(S, name) {

    SUtils = S.utils;

    this.S      = S;
    this.name   = name;
  }

  installDepedencies( dir ) {
    return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "installDepedencies()" method`));
  }

  // Helper methods for derived classes

  getName() {
    return this.name;
  }

  scaffold(func) {
    return BbPromise.resolve();
  }

  run(func) {
    return BbPromise.reject(new SError(`Runtime "${this.getName()}" should implement "run()" method`));
  }

  build(func, pathDist, stage, region) {
    return this._copyDir(func, pathDist, stage, region)
      .then(() => this._afterCopyDir(func, pathDist, stage, region))
      .then(() => this._generateIncludePaths(func, pathDist));
  }

  _copyDir(func, pathDist, stage, region) {
    return BbPromise.try(() => {
      // Status
      SUtils.sDebug(`"${stage} - ${region} - ${func.getName()}": Copying in dist dir ${pathDist}`);

      // Extract the root of the lambda package from the handler property
      let handlerFullPath = func.getRootPath(func.handler.split('/')[func.handler.split('/').length - 1]).replace(/\\/g, '/');

      // Check handler is correct
      if (handlerFullPath.indexOf(func.handler) == -1) {
        throw new SError('This function\'s handler is invalid and not in the file system: ' + func.handler);
      }

      let packageRoot = handlerFullPath.replace(func.handler, '');

      return wrench.copyDirSyncRecursive(packageRoot, pathDist, {
        exclude: this._exclude(func, pathDist, stage, region)
      });
    });
  }

  _exclude(func, pathDist, stage, region) {
    // Copy entire test project to temp folder, don't include anything in excludePatterns
    let excludePatterns = func.custom.excludePatterns || [];

    return function(name, prefix) {

        if (!excludePatterns.length) { return false;}

        let relPath = path.join(prefix.replace(pathDist, ''), name);

        return excludePatterns.some(sRegex => {
          relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

          let re        = new RegExp(sRegex),
            matches     = re.exec(relPath),
            willExclude = (matches && matches.length > 0);

          if (willExclude) {
            SUtils.sDebug(`"${stage} - ${region} - ${func.name}": Excluding - ${relPath}`);
          }

          return willExclude;
        });
      }
  }

  _getEnvVars(stage, region) {
    const project = this.S.getProject(),
          Key     = ['serverless', project.getName(), stage, region, 'envVars', '.env'].join('/'),
          Bucket  = project.getVariablesObject().projectBucket;

    SUtils.sDebug(`Getting ENV Vars: ${Bucket} - ${Key}`);

    return this.S.getProvider().request('S3', 'getObject', {Bucket, Key}, stage, project.getVariables().projectBucketRegion)
      .catch({code: 'NoSuchKey'}, () => ({Body: ''}))
      .then(reply => {
        let out  = {},
            vars = (new Buffer(reply.Body)).toString();

        vars.split('\n').forEach(line => {
          out[line.split('=')[0]] = line.split('=')[1]
        });

        return out;
      })
  }

  _afterCopyDir(func, pathDist, stage, region) {
    return BbPromise.resolve();
  }

  _generateIncludePaths(func, pathDist) {
    let compressPaths = [],
      ignore        = ['.DS_Store'],
      stats,
      fullPath;

    // Zip up whatever is in back
    let includePaths = func.custom.includePaths  || ['.'];

    includePaths.forEach(p => {

      try {
        fullPath = path.resolve(path.join(pathDist, p));
        stats    = fs.lstatSync(fullPath);
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

  getHandler(func) {
    return func.handler;
  }

}


module.exports = ServerlessRuntimeBase;
