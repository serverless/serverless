'use strict';

/**
 * Action: Code Package: Lambda: Nodejs
 * - Accepts one function
 * - Collects and optimizes the function's Lambda code in a temp folder
 * - Don't attach "evt" to context, it will be overwritten in concurrent operations
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
    wrench       = require('wrench');

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

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };
    _this.S3 = require('../../utils/aws/S3')(awsConfig);

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

    let _this = this;

    // Get Function JSON
    return JawsUtils.getFunctions(
        path.join(_this.Jaws._projectRootPath, 'back', 'slss_modules'),
        [evt.path])
        .then(function(functionJsons) {

          // Attach to evt
          evt.function = functionJsons[0];

          // Skip Function if it does not have a lambda
          if (!evt.function.cloudFormation ||
              !evt.function.cloudFormation.lambda ||
              !evt.function.cloudFormation.lambda.Function) {
            throw new JawsError(evt.function.name + 'does not have a lambda property');
          }

          // Validate lambda attributes
          let lambda = evt.function.cloudFormation.lambda;
          if (!lambda.Function.Type
              || !lambda.Function
              || !lambda.Function.Properties
              || !lambda.Function.Properties.Runtime
              || !lambda.Function.Properties.Handler) {
            throw new JawsError('Missing required lambda attributes');
          }

          return evt;
        });
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
    JawsUtils.jawsDebug('Packaging "' + evt.function.name + '"...');
    JawsUtils.jawsDebug('Saving in dist dir ' + evt.function.pathDist);
    JawsUtils.jawsDebug('Copying', _this.Jaws._projectRootPath, 'to', evt.function.pathDist);

    // Copy entire test project to temp folder
    let excludePatterns = evt.function.package.excludePatterns || [];

    wrench.copyDirSyncRecursive(
        path.join(_this.Jaws._projectRootPath, 'back'),
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
                JawsUtils.jawsDebug(`Excluding ${relPath}`);
              }

              return willExclude;
            });
          },
        }
    );

    JawsUtils.jawsDebug('Packaging stage & region:', evt.stage, evt.region.region);

    // Get ENV file from S3
    return _this.S3.sGetEnvFile(
        evt.region.jawsBucket,
        _this.Jaws._projectJson.name,
        evt.stage
        )
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

    let _this            = this,
        lambda           = evt.function.cloudFormation.lambda,
        deferred         = false,
        optimizeSettings = evt.function.package.optimize;

    if (optimizeSettings.builder) {

      deferred = _this._optimize(evt)
          .then(optimizedCodeBuffer => {

            let envData         = fs.readFileSync(path.join(evt.function.pathDist, '.env')),
                handlerFileName = lambda.Function.Properties.Handler.split('.')[0];

            // Create pathsPackaged for each file ready to compress
            evt.function.pathsPackaged   = [
              // handlerFileName is the full path lambda file including dir rel to back
              { fileName: handlerFileName + '.js', data: optimizedCodeBuffer },
              { fileName: '.env', data: envData },
            ];
            evt.function.pathsPackaged = evt.function.pathsPackaged.concat(_this._generateIncludePaths(evt));

            return evt;
          });

    } else {

      // User chose not to optimize, zip up whatever is in back
      optimizeSettings.includePaths = ['.'];

      // Create pathsPackaged for each file ready to compress
      evt.function.pathsPackaged      = _this._generateIncludePaths(evt);

      deferred = BbPromise.resolve(evt);
    }

    return deferred;
  }

  /**
   * Optimize
   */

  _optimize(evt) {

    let _this   = this,
        lambda  = evt.function.cloudFormation.lambda;

    if (!evt.function.package.optimize
        || !evt.function.package.optimize.builder) {
      return BbPromise.reject(new JawsError('Cant optimize for nodejs. lambda jaws.json does not have optimize.builder set'));
    }

    if (evt.function.package.optimize.builder.toLowerCase() == 'browserify') {
      JawsUtils.jawsDebug('Optimizing via Browserify: ' + evt.function.name + '"...');
      return _this._browserifyBundle(evt);
    } else {
      return BbPromise.reject(new JawsError(`Unsupported builder ${builder}`));
    }
  }

  /**
   * Generate Include Paths
   */

  _generateIncludePaths(evt) {

    let _this         = this,
        compressPaths = [],
        ignore        = ['.DS_Store'],
        stats,
        fullPath;

    evt.function.package.optimize.includePaths.forEach(p => {

      try {
        fullPath = path.resolve(path.join(evt.function.pathDist, p));
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
   * Browserify Bundle
   * - Browserify the code and return buffer of bundled code
   */

  _browserifyBundle(evt) {

    let _this       = this;
    let uglyOptions = {
      mangle:   true, // @see http://lisperator.net/uglifyjs/compress
      compress: {},
    };

    let b           = browserify({
      basedir:          evt.function.pathDist,
      entries:          [evt.function.cloudFormation.lambda.Function.Properties.Handler.split('.')[0] + '.js'],
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

    if (evt.function.package.optimize.babel) {
      b.transform(babelify);
    }

    if (evt.function.package.optimize.transform) {
      JawsUtils.jawsDebug('Adding transform', evt.function.package.optimize.transform);
      b.transform(evt.function.package.optimize.transform);
    }

    // optimize.exclude
    evt.function.package.optimize.exclude.forEach(file => {
      JawsUtils.jawsDebug('Excluding', file);
      b.exclude(file);
    });

    // optimize.ignore
    evt.function.package.optimize.ignore.forEach(file => {
      JawsUtils.jawsDebug('Ignoring', file);
      b.ignore(file);
    });

    // Perform Bundle
    let bundledFilePath = path.join(evt.function.pathDist, 'bundled.js');   // Save for auditing
    let minifiedFilePath = path.join(evt.function.pathDist, 'minified.js'); // Save for auditing

    return new BbPromise(function(resolve, reject) {
      b.bundle(function(err, bundledBuf) {
        if (err) {
          console.error('Error running browserify bundle');
          reject(err);
        } else {

          fs.writeFileSync(bundledFilePath, bundledBuf);
          JawsUtils.jawsDebug(`Bundled file written to ${bundledFilePath}`);

          if (evt.function.package.optimize.minify) {
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