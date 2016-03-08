'use strict';

/**
 * Action: Code Package: Lambda
 * - Accepts one function
 * - Collects the function's Lambda code in a distribution folder
 * - Don't attach "options" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'Error')),
    BbPromise    = require('bluebird'),
    fs           = require('fs'),
    os           = require('os'),
    wrench       = require('wrench');
  let SUtils;

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class CodePackageLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + CodePackageLambda.name;
    }

    registerActions() {

      this.S.addAction(this.codePackageLambda.bind(this), {
        handler:       'codePackageLambda',
        description:   'Package a function to be deployed with Lambda'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    codePackageLambda(evt) {
      let packager = new Packager(this.S);
      return packager.package(evt);
    }
  }

  /**
   * Packager
   * - Necessary for this action to run concurrently
   */

  class Packager {

    constructor(S) {
      this.S = S;
    }

    package(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._createDistFolder)
        .then(_this._package)
        .then(function() {

          /**
           * Return EVT
           */

          _this.evt.data.pathsPackaged = _this.pathsPackaged;
          _this.evt.data.pathDist      = _this.pathDist;
          return _this.evt;

        });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {

      let _this = this;

      // Instantiate classes
      _this.aws      = _this.S.getProvider('aws');
      _this.project  = _this.S.getProject();
      _this.function = _this.S.getProject().getFunction( _this.evt.options.name );

      if (!_this.function) BbPromise.reject(new SError(`Function could not be found: ${_this.evt.options.name}`));

      //TODO: Use Function.validate()

      // Validate
      if (!_this.function.name) {
        throw new SError('Function does not have a name property');
      }
      if (!_this.function.handler) {
        throw new SError('Function does not have a handler property');
      }
      if (!_this.function.timeout) {
        throw new SError('Function does not have a timeout property');
      }
      if (!_this.function.memorySize) {
        throw new SError('Function does not have a memorySize property');
      }
      if (!_this.function.getRuntime().getName()) {
        throw new SError('Function does not have a runtime property');
      }



      return BbPromise.resolve();
    }

    /**
     * Create Distribution Folder
     */

    _createDistFolder() {

      let _this = this;

      // Set Dist Dir
      let d          = new Date();
      _this.pathDist = _this.S.getProject().getRootPath('_meta', '_tmp', _this.function.name + '@' + d.getTime());

      // Status
      SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.name}": Copying in dist dir ${_this.pathDist}`);

      // Copy entire test project to temp folder, don't include anything in excludePatterns
      let excludePatterns = this.function.custom.excludePatterns || [];

      wrench.copyDirSyncRecursive(
          path.join(_this.project.getRootPath(), _this.function.getComponent().getName()),
          _this.pathDist,
        {
          exclude: function(name, prefix) {

            if (!excludePatterns.length) {
              return false;
            }

            let relPath = path.join(
              prefix.replace(_this.pathDist, ''), name);

            return excludePatterns.some(sRegex => {
              relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

              let re        = new RegExp(sRegex),
                matches     = re.exec(relPath),
                willExclude = (matches && matches.length > 0);

              if (willExclude) {
                SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.name}": Excluding - ${relPath}`);
              }

              return willExclude;
            });
          }
        }
      );

      let key  = ['serverless', _this.project.name, _this.evt.options.stage, _this.evt.options.region, 'envVars', '.env'].join('/'),
        params = {
          Bucket: _this.project.getVariablesObject().projectBucket,
          Key:    key
        };

      SUtils.sDebug(`Getting ENV Vars: ${_this.project.getVariablesObject().projectBucket} - ${key}`);

      // Get ENV file from S3
      let NoSuchKey = {code: 'NoSuchKey'};
      return _this.aws.request('S3', 'getObject', params, _this.evt.options.stage, _this.S.getProject().getVariables().projectBucketRegion)
        .catch(NoSuchKey => ({Body: ''}))
        .then(function(s3ObjData) {

          fs.writeFileSync(
            path.join(_this.pathDist,'.env'),
            s3ObjData.Body);
        });
    }

    /**
     * Package
     */

    _package() {

      // Create pathsPackaged for each file ready to compress
      this.pathsPackaged = this._generateIncludePaths();

      return BbPromise.resolve();
    }

    /**
     * Generate Include Paths
     */

    _generateIncludePaths() {

      let _this       = this,
        compressPaths = [],
        ignore        = ['.DS_Store'],
        stats,
        fullPath;

      // Zip up whatever is in back
      let includePaths = this.function.custom.includePaths ? this.function.custom.includePaths : ['.'];

      includePaths.forEach(p => {

        try {
          fullPath = path.resolve(path.join(_this.pathDist, p));
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

      return compressPaths;
    }
  }

  return( CodePackageLambda );
};
