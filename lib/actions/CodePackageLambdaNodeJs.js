'use strict';

/**
 * Action: Code Package: Lambda: Nodejs
 * - Accepts one function
 * - Collects the function's Lambda code in a distribution folder
 * - Don't attach "options" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    BbPromise    = require('bluebird'),
    fs           = require('fs'),
    os           = require('os'),
    wrench       = require('wrench');

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class CodePackageLambdaNodejs extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + CodePackageLambdaNodejs.name;
    }

    registerActions() {

      this.S.addAction(this.codePackageLambdaNodejs.bind(this), {
        handler:       'codePackageLambdaNodejs',
        description:   'Deploys the code or endpoint of a function, or both'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda Node.Js
     */

    codePackageLambdaNodejs(options) {
      let packager = new Packager(this.S);
      return packager.package(options);
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

    package(options) {

      let _this     = this;
      _this.options = options;

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._createDistFolder)
        .then(_this._package)
        .then(function() {

          /**
           * Return Action Data
           * - WARNING: Adjusting these will break Plugins
           */

          return {
            options:       _this.options,
            pathsPackaged: _this.pathsPackaged,
            pathDist:      _this.pathDist
          };
        });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {

      let _this = this;

      // Instantiate classes
      _this.meta     = new _this.S.classes.Meta(_this.S);
      _this.project  = new _this.S.classes.Project(_this.S);
      _this.function = new _this.S.classes.Function(_this.S, {
        module:   _this.options.module,
        function: _this.options.function
      });

      //TODO: Use Function.validate()

      // Validate
      if (!_this.function.data.name) {
        throw new SError('Function does not have a name property');
      }
      if (!_this.function.data.handler) {
        throw new SError('Function does not have a handler property');
      }
      if (!_this.function.data.timeout) {
        throw new SError('Function does not have a timeout property');
      }
      if (!_this.function.data.memorySize) {
        throw new SError('Function does not have a memorySize property');
      }
      if (!_this.function.data.runtime) {
        throw new SError('Function\'s parent module is missing a runtime property');
      }

      // Load AWS Service Instances
      let awsConfig = {
        region:          _this.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };
      _this.S3 = require('../utils/aws/S3')(awsConfig);

      return BbPromise.resolve();
    }

    /**
     * Create Distribution Folder
     */

    _createDistFolder() {

      let _this = this;

      // Create dist folder
      let d          = new Date();
      _this.pathDist = path.join(os.tmpdir(), _this.function.data.name + '@' + d.getTime());

      // Status
      SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Copying in dist dir ${_this.pathDist}`);

      // Copy entire test project to temp folder, don't include anything in excludePatterns
      let excludePatterns = this.function.data.custom.excludePatterns || [];

      wrench.copyDirSyncRecursive(
        path.join(_this.S.config.projectPath, 'back'),
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
                SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Excluding - ${relPath}`);
              }

              return willExclude;
            });
          }
        }
      );

      // Get ENV file from S3
      return _this.S3.sGetEnvFile(
        _this.meta.data.private.variables.projectBucket,
        _this.project.data.name,
        _this.options.stage,
        _this.options.region)
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

      // Zip up whatever is in back
      this.function.data.custom.includePaths = ['.'];

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

      _this.function.data.custom.includePaths.forEach(p => {

        try {
          fullPath = path.resolve(path.join(_this.pathDist, p));
          stats    = fs.lstatSync(fullPath);
        } catch (e) {
          console.error('Cant find includePath ', p, e);
          throw e;
        }

        if (stats.isFile()) {

          compressPaths.push({
            fileName: p,
            data:     fs.readFileSync(fullPath)
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

              let filePath = [fullPath, file].join('/');
              if (fs.lstatSync(filePath).isFile()) {
                let pathInZip = path.join(dirname, file);
                compressPaths.push({
                  fileName: pathInZip,
                  data:     fs.readFileSync(filePath)
                });
              }
            });
        }
      });
      return compressPaths;
    }
  }

  return( CodePackageLambdaNodejs );
};
