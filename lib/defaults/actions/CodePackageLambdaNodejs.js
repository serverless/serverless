'use strict';

/**
 * Action: Code Package: Lambda: Nodejs
 * - Accepts one function
 * - Collects and optimizes the function's Lambda code in a temp folder
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os'),
    babelify     = require('babelify'),
    browserify   = require('browserify'),
    UglifyJS     = require('uglify-js'),
    wrench       = require('wrench'),
    Zip          = require('node-zip');

// Promisify fs module
BbPromise.promisifyAll(fs);

class CodePackageLambdaNodejs extends JawsPlugin {

  /**
   * Constructor
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'jaws.core.' + CodePackageLambdaNodejs.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.Jaws.addAction(this.codePackageLambdaNodejs.bind(this), {
      handler:       'codePackageLambdaNodejs',
      description:   'Deploys the code or endpoint of a function, or both'
    });

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  codePackageLambdaNodejs(evt) {

    let _this = this;
    _this.evt = evt;

    // Load AWS Service Instances
    let awsConfig = {
      region:          _this.evt.region.region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };
    _this.S3 = require('../../utils/aws/S3')(awsConfig);

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._createDistFolder)
        .then(_this._package)
        .then(function() {
          return _this.evt;
        })
        .catch(function(e) {console.log(e, e.stack)})
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare() {

    let _this = this;

    // Skip Function if it does not have a lambda
    if (!_this.evt.function.cloudFormation ||
        !_this.evt.function.cloudFormation.lambda) {
      return Promise.reject(new JawsError(_this.evt.function.name + 'does not have a lambda property'));
    }

    // Validate lambda attributes
    let lambda = _this.evt.function.cloudFormation.lambda;
    if (!lambda.Function.Type
        || !lambda.Function
        || !lambda.Function.Properties
        || !lambda.Function.Properties.Runtime
        || !lambda.Function.Properties.Handler) {
      return Promise.reject(new JawsError('Missing required lambda attributes'));
    }

    // Return
    return BbPromise.resolve();
  }

  /**
   * Create Distribution Folder
   */

  _createDistFolder() {

    let _this = this;

    // Create dist folder
    let d             = new Date();
    _this.evt.function.pathDist = path.join(os.tmpdir(), _this.evt.function.name + '@' + d.getTime());

    // Status
    JawsUtils.jawsDebug('Packaging "' + _this.evt.function.name + '"...');
    JawsUtils.jawsDebug('Saving in dist dir ' + _this.evt.function.pathDist);
    JawsUtils.jawsDebug('Copying', _this.Jaws._projectRootPath, 'to', _this.evt.function.pathDist);

    // Copy entire test project to temp folder
    let excludePatterns = _this.evt.function.package.excludePatterns || [];
    wrench.copyDirSyncRecursive(
        _this.Jaws._projectRootPath,
        _this.evt.function.pathDist,
        {
          exclude: function(name, prefix) {
            if (!excludePatterns.length) {
              return false;
            }

            let relPath = path.join(
                prefix.replace(_this.evt.function.pathDist, ''), name);

            return excludePatterns.some(sRegex => {
              relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

              let re          = new RegExp(sRegex),
                  matches     = re.exec(relPath),
                  willExclude = (matches && matches.length > 0);

              if (willExclude) {
                JawsUtils.jawsDebug(`Excluding ${relPath}`);
              }

              return willExclude;
            });
          },
        }
    );

    JawsUtils.jawsDebug('Packaging stage & region:', _this.evt.stage, _this.evt.region.region);

    // Get ENV file from S3
    return _this.S3.sGetEnvFile(
        _this.evt.region.jawsBucket,
        _this.Jaws._projectJson.name,
        _this.evt.stage
        )
        .then(function(s3ObjData) {
          fs.writeFileSync(
              path.join(_this.evt.function.pathDist,'.env'),
              s3ObjData.Body);
        });
  }

  /**
   * Package
   */

  _package() {

    let _this            = this,
        lambda           = _this.evt.function.cloudFormation.lambda,
        deferred         = false,
        targetZipPath    = path.join(_this.evt.function.pathDist, 'package.zip'),
        optimizeSettings = _this.evt.function.package.optimize;

    if (optimizeSettings.builder) {

      deferred = _this._optimize()
          .then(optimizedCodeBuffer => {

            let envData         = fs.readFileSync(path.join(_this.evt.function.pathDist, '.env')),
                handlerFileName = lambda.Function.Properties.Handler.split('.')[0],
                compressPaths   = [
                  // handlerFileName is the full path lambda file including dir rel to back
                  { fileName: handlerFileName + '.js', data: optimizedCodeBuffer },
                  { fileName: '.env', data: envData },
                ];

            compressPaths = compressPaths.concat(_this._generateIncludePaths());
            return compressPaths;
          });

    } else {

      // User chose not to optimize, zip up whatever is in back
      optimizeSettings.includePaths = ['.'];
      let compressPaths             = _this._generateIncludePaths();

      deferred = Promise.resolve(compressPaths);

    }

    return deferred
        .then(compressPaths => {
          return _this._compress(compressPaths, targetZipPath);
        })
        .then(zipFilePath => {
          _this.evt.function.pathCompressed = zipFilePath;
        });
  }

  /**
   * Optimize
   */

  _optimize() {

    let _this   = this,
        lambda  = _this.evt.function.cloudFormation.lambda;

    if (!_this.evt.function.package.optimize
        || !_this.evt.function.package.optimize.builder) {
      return Promise.reject(new JawsError('Cant optimize for nodejs. lambda jaws.json does not have optimize.builder set'));
    }

    if (_this.evt.function.package.optimize.builder.toLowerCase() == 'browserify') {
      JawsUtils.jawsDebug('Optimizing via Browserify: ' + _this.evt.function.name + '"...');
      return _this._browserifyBundle();
    } else {
      return Promise.reject(new JawsError(`Unsupported builder ${builder}`));
    }
  }

  /**
   * Generate Include Paths
   */

  _generateIncludePaths() {

    let _this         = this,
        compressPaths = [],
        ignore        = ['.DS_Store'],
        stats,
        fullPath;

    _this.evt.function.package.optimize.includePaths.forEach(p => {

      try {
        fullPath = path.resolve(path.join(_this.evt.function.pathDist, p));
        stats    = fs.lstatSync(fullPath);
      } catch (e) {
        console.error('Cant find includePath ', p, e);
        throw e;
      }

      if (stats.isFile()) {
        JawsUtils.jawsDebug('INCLUDING', fullPath);
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
                JawsUtils.jawsDebug('INCLUDING', pathInZip);
                compressPaths.push({fileName: pathInZip, data: fs.readFileSync(filePath)});
              }
            });
      }
    });

    return compressPaths;
  }

  /**
   * Compress
   */

  _compress(compressPaths, targetZipPath) {
    let zip = new Zip();

    compressPaths.forEach(nc => {
      zip.file(nc.fileName, nc.data);
    });

    let zipBuffer = zip.generate({
      type:        'nodebuffer',
      compression: 'DEFLATE',
    });

    if (zipBuffer.length > 52428800) {
      Promise.reject(new JawsError(
          'Zip file is > the 50MB Lambda queued limit (' + zipBuffer.length + ' bytes)',
          JawsError.errorCodes.ZIP_TOO_BIG)
      );
    }

    fs.writeFileSync(targetZipPath, zipBuffer);
    JawsUtils.jawsDebug(`Compressed code written to ${targetZipPath}`);

    return Promise.resolve(targetZipPath);
  }

  /**
   * Browserify Bundle
   * - Browserify the code and return buffer of bundled code
   */

  _browserifyBundle() {

    let _this       = this;
    let uglyOptions = {
      mangle:   true, // @see http://lisperator.net/uglifyjs/compress
      compress: {},
    };

    let b           = browserify({
      basedir:          _this.evt.function.pathDist,
      entries:          [_this.evt.function.cloudFormation.lambda.Function.Properties.Handler.split('.')[0] + '.js'],
      standalone:       'lambda',
      browserField:     false,  // Setup for node app (copy logic of --node in bin/args.js)
      builtins:         false,
      commondir:        false,
      ignoreMissing:    true,  // Do not fail on missing optional dependencies
      detectGlobals:    true,  // Default for bare in cli is true, but we don't care if its slower
      insertGlobalVars: {   // Handle process https://github.com/substack/node-browserify/issues/1277
        //__filename: insertGlobals.lets.__filename,
        //__dirname: insertGlobals.lets.__dirname,
        process: function() {
        },
      },
    });

    if (_this.evt.function.package.optimize.babel) {
      b.transform(babelify);
    }

    if (_this.evt.function.package.optimize.transform) {
      JawsUtils.jawsDebug('Adding transform', _this.evt.function.package.optimize.transform);
      b.transform(_this.evt.function.package.optimize.transform);
    }

    // optimize.exclude
    _this.evt.function.package.optimize.exclude.forEach(file => {
      JawsUtils.jawsDebug('Excluding', file);
      b.exclude(file);
    });

    // optimize.ignore
    _this.evt.function.package.optimize.ignore.forEach(file => {
      JawsUtils.jawsDebug('Ignoring', file);
      b.ignore(file);
    });

    // Perform Bundle
    let bundledFilePath = path.join(_this.evt.function.pathDist, 'bundled.js');   // Save for auditing
    let minifiedFilePath = path.join(_this.evt.function.pathDist, 'minified.js'); // Save for auditing

    return new Promise(function(resolve, reject) {
      b.bundle(function(err, bundledBuf) {
        if (err) {
          console.error('Error running browserify bundle');
          reject(err);
        } else {

          fs.writeFileSync(bundledFilePath, bundledBuf);
          JawsUtils.jawsDebug(`Bundled file written to ${bundledFilePath}`);

          if (_this.evt.function.package.optimize.minify) {
            JawsUtils.jawsDebug('Minifying...');
            let result = UglifyJS.minify(bundledFilePath, uglyOptions);

            if (!result || !result.code) {
              reject(new JawsError('Problem uglifying code'));
            }

            fs.writeFileSync(minifiedFilePath, result.code);

            JawsUtils.jawsDebug(`Minified file written to ${minifiedFilePath}`);
            resolve(result.code);
          } else {
            resolve(bundledBuf);
          }
        }
      });
    });
  }
}

module.exports = CodePackageLambdaNodejs;