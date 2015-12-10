'use strict';

/**
 * Action: Code Package: Lambda: Nodejs
 * - Accepts one function
 * - Collects the function's Lambda code in a distribution folder
 * - Don't attach "evt" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently
 */

const SPlugin    = require('../ServerlessPlugin'),
    SError       = require('../ServerlessError'),
    SUtils       = require('../utils/index'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
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

  codePackageLambdaNodejs(evt) {
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

    let _this = this;

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };
    _this.S3 = require('../utils/aws/S3')(awsConfig);

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._createDistFolder)
        .then(_this._package)
        .then(function() {
          return evt;
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {

    // Validate
    if (!evt.function.name) {
      throw new SError('Function does not have a name property');
    }
    if (!evt.function.handler) {
      throw new SError('Function does not have a handler property');
    }
    if (!evt.function.timeout) {
      throw new SError('Function does not have a handler property');
    }
    if (!evt.function.memorySize) {
      throw new SError('Function does not have a memorySize property');
    }
    if (!evt.function.module.runtime) {
      throw new SError('Function\'s parent module is missing a runtime property');
    }

    return BbPromise.resolve(evt);
  }

  /**
   * Create Distribution Folder
   */

  _createDistFolder(evt) {

    let _this = this;

    // Create dist folder
    let d                 = new Date();
    evt.function.pathDist = path.join(os.tmpdir(), evt.function.name + '@' + d.getTime());

    // Status
    SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Copying in dist dir ${evt.function.pathDist}`);

    // Copy entire test project to temp folder
    let excludePatterns = evt.function.custom.excludePatterns || [];

    wrench.copyDirSyncRecursive(
        path.join(_this.S._projectRootPath, 'back'),
        evt.function.pathDist,
        {
          exclude: function(name, prefix) {

            if (!excludePatterns.length) {
              return false;
            }

            let relPath = path.join(
                prefix.replace(evt.function.pathDist, ''), name);

            return excludePatterns.some(sRegex => {
              relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

              let re          = new RegExp(sRegex),
                  matches     = re.exec(relPath),
                  willExclude = (matches && matches.length > 0);

              if (willExclude) {
                SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Excluding - ${relPath}`);
              }

              return willExclude;
            });
          },
        }
    );

    // Get ENV file from S3
    return _this.S3.sGetEnvFile(
        evt.region.regionBucket,
        _this.S._projectJson.name,
        evt.stage)
        .then(function(s3ObjData) {

          fs.writeFileSync(
              path.join(evt.function.pathDist,'.env'),
              s3ObjData.Body);

          return evt;
        });
  }

  /**
   * Package
   */

  _package(evt) {

    let _this = this;

    // Zip up whatever is in back
    evt.function.custom.includePaths = ['.'];

    // Create pathsPackaged for each file ready to compress
    evt.function.pathsPackaged    = _this._generateIncludePaths(evt);

    return BbPromise.resolve(evt);
  }

  /**
   * Generate Include Paths
   */

  _generateIncludePaths(evt) {

    let compressPaths = [],
        ignore        = ['.DS_Store'],
        stats,
        fullPath;

   evt.function.custom.includePaths.forEach(p => {

      try {
        fullPath = path.resolve(path.join(evt.function.pathDist, p));
        stats    = fs.lstatSync(fullPath);
      } catch (e) {
        console.error('Cant find includePath ', p, e);
        throw e;
      }

      if (stats.isFile()) {
        compressPaths.push({fileName: p, data: fs.readFileSync(fullPath)});
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
                compressPaths.push({fileName: pathInZip, data: fs.readFileSync(filePath)});
              }
            });
      }
    });

    return compressPaths;
  }
}

module.exports = CodePackageLambdaNodejs;