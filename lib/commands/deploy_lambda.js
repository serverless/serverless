'use strict';

/**
 * JAWS Command: deploy lambda <stage> <region>
 * - Deploys project's lambda(s) to the specified stage
 */

var JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    AWS = require('aws-sdk'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils/index'),
    browserify = require('browserify'),
    UglifyJS = require('uglify-js'),
    wrench = require('wrench'),
    CMDtag = require('./tag'),
    Zip = require('node-zip');

Promise.promisifyAll(fs);

/**
 * Run
 * @param JAWS
 * @param stage
 * @param regions - Defaults to all regions
 * @param allTagged
 * @param allAtOnce
 * @returns {*}
 */

module.exports.run = function(JAWS, stage, regions, allTagged, allAtOnce) {
  var command = new CMD(JAWS, stage, regions, allTagged, allAtOnce);
  return command.run();
};

/**
 * Command Class
 * @param JAWS
 * @param stage
 * @param regions - Defaults to all regions
 * @param allTagged
 * @param allAtOnce
 * @constructor
 */

function CMD(JAWS, stage, regions, allTagged, allAtOnce) {
  this._JAWS = JAWS;
  this._stage = stage;
  this._regions = regions.length ? regions : Object.keys(this._JAWS._meta.projectJson.project.stages[this._stage]);
  this._allTagged = allTagged;
  this._allAtOnce = allAtOnce;
  this._lambdaPaths = [];
}

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  // Flow
  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(_this._validate)
      .then(_this._getTaggedLambdaPaths)
      .then(function() {
        return _this._regions;
      })
      .each(function(region) {
        var deployer = new Deployer(_this._JAWS, _this._lambdaPaths, _this._stage, region);
        return deployer.deploy();
      }).then(function() {
        JawsCLI.log('Lambda Deployer:  Successfully deployed lambdas to the requested regions!');
        return Promise.resolve();
      });
});

/**
 * CMD: Prompt: Stage
 */

CMD.prototype._promptStage = Promise.method(function() {

  var _this = this;

  // If stage exists, skip
  if (_this._stage) return;

  var stages = Object.keys(_this._JAWS._meta.projectJson.project.stages);

  // Check if project has stages
  if (!stages.length) {
    throw new JawsError('This project has no stages');
  }

  // If project only has 1 stage, skip prompt
  if (stages.length === 1) {
    _this._stage = stages[0];
    return;
  }

  // Create Choices
  var choices = [];
  for (var i = 0; i < stages.length; i++) {
    choices.push({
      key: (i + 1) + ') ',
      value: stages[i],
    });
  }

  return JawsCLI.select('Lambda Deployer:  Choose a stage: ', choices, false)
      .then(function(results) {
        _this._stage = results[0].value;
      });
});

/**
 * CMD: Validate
 */

CMD.prototype._validate = Promise.method(function() {

  var _this = this;

  // Validate: Check stage exists within project
  if (!_this._JAWS._meta.projectJson.project.stages[_this._stage]) {
    throw new JawsError('Invalid stage ' + stage);
  }
});

/**
 * CMD: Get Tagged Lambda Paths
 */

CMD.prototype._getTaggedLambdaPaths = Promise.method(function() {

  var _this = this;

  if (_this._allTagged) {
    return CMDtag.listAll(_this._JAWS, 'lambda')
        .then(function(lambdaPaths) {

          if (!lambdaPaths.length) {
            throw new JawsError('No tagged lambdas found');
          }

          _this._lambdaPaths = lambdaPaths;
        });
  } else {
    return CMDtag.tag('lambda')
        .then(function(lambdaPath) {

          if (!lambdaPath) {
            throw new JawsError('No tagged lambdas found');
          }

          _this._lambdaPaths = [lambdaPath];
        });
  }
});

/**
 * Deployer Class
 */

function Deployer(JAWS, lambdaPaths, stage, region) {
  this._JAWS = JAWS;
  this._lambdaPaths = lambdaPaths;
  this._stage = stage;
  this._region = region;
}

/**
 * Deployer: Deploy
 */

Deployer.prototype.deploy = Promise.method(function() {

  var _this = this;
  var arns = {};
  arns[_this._region] = {};

  return Promise.try(function() {
      })
      .bind(_this)
      .then(function() {
        return _this._lambdaPaths;
      })
      .each(function(lambdaPath) {
        var packager = new Packager(
            _this._JAWS,
            _this._stage,
            _this._region,
            lambdaPath);
        return packager.package()
            .bind(_this)
            .then(_this._createOrUpdateLambda)
            .then(function(result) {
              arns[_this._region][result.lambdaName] = result.arn;
            });
      })
      .then(function() {
        JawsCLI.log('Lambda Deployer:  Done deploying lambdas in ' + _this._region);
        //utils.logIfVerbose(arns);
      });
});

/**
 * Deployer: Create Or Update Lambda (On AWS)
 */

Deployer.prototype._createOrUpdateLambda = Promise.method(function(packagedLambda) {

  var _this = this;
  var lambdaJawsJson = require(packagedLambda.jawsFilePath);
  var iamRole = utils.getProjRegionConfig(
      _this._JAWS._meta.projectJson.project.stages[_this._stage],
      _this._region).iamRoleArnLambda;
  var params = {
    FunctionName: packagedLambda.fullLambdaName,
    Handler: lambdaJawsJson.lambda.handler,
    Role: iamRole,
    Runtime: lambdaJawsJson.lambda.runtime,
    Description: lambdaJawsJson.description,
    MemorySize: lambdaJawsJson.lambda.memorySize,
    Timeout: lambdaJawsJson.lambda.timeout,
  };

  // Instantiate Lambda
  var l = new AWS.Lambda({ // Don't put into AWSUtils because we may want to use diff apiVersion
    apiVersion: '2015-03-31',
  });

  // Promisify lambda functions
  var lGetFunctionAsync = Promise.promisify(l.getFunction, l);
  var lCreateFunctionAsync = Promise.promisify(l.createFunction, l);
  var lUpdateFunctionCodeAsync = Promise.promisify(l.updateFunctionCode, l);
  var lUpdateFunctionConfigurationAsync = Promise.promisify(l.updateFunctionConfiguration, l);

  // Check if Lambda exists
  return lGetFunctionAsync({FunctionName: packagedLambda.fullLambdaName})
      .then(function() {

        // Lambda exists, update it
        JawsCLI.log('Lambda Deployer:  Updating "'
            + packagedLambda.fullLambdaName
            + '" on AWS Lambda in region "'
            + _this._region
            + '" (Bytes: '
            + packagedLambda.zipBuffer.length
            + ')');

        return lUpdateFunctionCodeAsync({
          FunctionName: packagedLambda.fullLambdaName,
          ZipFile: packagedLambda.zipBuffer,
        })
            .then(function() {
              return lUpdateFunctionConfigurationAsync({
                FunctionName: params.FunctionName,
                Description: params.Description,
                Handler: params.Handler,
                MemorySize: params.MemorySize,
                Role: params.Role,
                Timeout: params.Timeout,
              });
            });
      })
      .error(function(e) {
        if (e && e.code !== 'ResourceNotFoundException') {
          console.error('Error trying to create/update', packagedLambda.fullLambdaName, e);
          throw new JawsError(e.message, JawsError.errorCodes.UNKNOWN);
        }

        // Lambda doesn't exist, create it
        JawsCLI.log('Lambda Deployer:  Creating "'
            + packagedLambda.fullLambdaName
            + '" on AWS Lambda in region "'
            + _this._region
            + '" (Bytes: '
            + packagedLambda.zipBuffer.length
            + ')');

        params.Code = {ZipFile: packagedLambda.zipBuffer};
        return lCreateFunctionAsync(params);
      })
      .then(function(data) {
        return {
          lambdaName: packagedLambda.fullLambdaName,
          arn: data.FunctionArn,
        };
      });
});

/**
 * Packager Class
 */

function Packager(JAWS, stage, region, lambdaPath) {
  this._JAWS = JAWS;
  this._lambdaPath = lambdaPath;
  this._stage = stage;
  this._region = region;
  this._srcDir = os.tmpdir();
  this._lambdaJson = require(this._lambdaPath);
}

/**
 * Packager: Package
 */

Packager.prototype.package = Promise.method(function() {

  var _this = this;

  // Set Lambda Name
  _this._lambdaName = [
    _this._stage,
    _this._JAWS._meta.projectJson.name,
    _this._lambdaJson.lambda.functionName,
  ].join('_-_');

  // Package
  return _this._createDistFolder()
      .then(function() {

        // Package by runtime
        switch (_this._lambdaJson.lambda.runtime) {
          case 'nodejs':
            return _this._packageNodeJs()
                .then(function(packageData) {
                  packageData.fullLambdaName = _this._lambdaName;
                  return packageData;
                });
            break;
          default:
            return Promise.reject(new JawsError('Unsupported lambda runtime ' + jawsJson.lambda.runtime));
            break;
        }
      });
});

/**
 * Packager: Create Dist Folder (for an individual lambda)
 */

Packager.prototype._createDistFolder = Promise.method(function() {

  var _this = this;

  // Create dist folder
  var d = new Date();
  _this._distDir = path.join(os.tmpdir(), _this._lambdaName + '@' + d.getTime());
  fs.mkdirSync(_this._distDir);

  // Status
  JawsCLI.log('Lambda Deployer:  Packaging "' + _this._lambdaName + '"...');
  JawsCLI.log('Lambda Deployer:  Saving in dist dir ' + _this._distDir);

  // Copy entire test project to temp folder
  _this._excludePatterns = _this._lambdaJson.lambda.package.excludePatterns || [];
  wrench.copyDirSyncRecursive(
      path.join(_this._JAWS._meta.projectRootPath, 'back'),
      path.join(_this._distDir, 'back'),
      {
        exclude: function(name, prefix) {
          if (!_this._excludePatterns.length) {
            return false;
          }

          var relPath = path.join(
              prefix.replace(path.join(_this._distDir, 'back'), ''),
              name);

          return _this._excludePatterns.some(function(sRegex) {
            relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

            var re = new RegExp(sRegex),
                matches = re.exec(relPath);

            var willExclude = (matches && matches.length > 0);

            if (willExclude) {
              JawsCLI.log('Lambda Deployer:  Excluding ' + relPath);
            }

            return willExclude;
          });
        },
      }
  );

  // Get ENV file from S3
  JawsCLI.log('Lambda Deployer:  Getting ENV file from S3 bucket: '
      + _this._JAWS._meta.projectJson.project.envVarBucket.name);
  return AWSUtils.getEnvFile(
          _this._JAWS._meta.profile,
          _this._JAWS._meta.projectJson.project.envVarBucket.region,
          _this._JAWS._meta.projectJson.project.envVarBucket.name,
          _this._JAWS._meta.projectJson.name,
          _this._stage)
      .then(function(s3ObjData) {

        // Always add env file at root of back
        var targetBackDir = path.join(_this._JAWS._meta.projectRootPath, 'back');
        fs.writeFileSync(path.join(targetBackDir, '.env'), s3ObjData.Body);
        return Promise.resolve();
      });
});

/**
 * Packager: Package NodeJs
 */

Packager.prototype._packageNodeJs = Promise.method(function() {

  var _this = this,
      deferred = null;

  if (_this._lambdaJson.lambda.package
      && _this._lambdaJson.lambda.package.optimize
      && _this._lambdaJson.lambda.package.optimize.builder) {

    deferred = _this._optimizeNodeJs()
        .then(function(optimizedCodeBuffer) {

          // Lambda freaks out if code doesnt end in newline
          var ocbWithNewline = optimizedCodeBuffer.concat(new Buffer('\n'));
          var envData = fs.readFileSync(path.join(_this._distDir, 'back', '.env'));

          var handlerFileName = _this._lambdaJson.lambda.handler.split('.')[0],
              compressPaths = [

                // handlerFileName is the full path lambda file including dir rel to back
                {fileName: handlerFileName + '.js', data: ocbWithNewline},
                {fileName: '.env', data: envData },
              ];

          if (_this._lambdaJson.lambda.package.optimize.includePaths.length) {
            compressPaths = compressPaths.concat(_this._generateIncludePaths());
          }

          return _this._compressCode(compressPaths);
        });
  } else {

    // User chose not to optimize, zip up whatever is in back
    _this._lambdaJson.lambda.package.optimize.includePaths = ['.'];
    var compressPaths = _this._generateIncludePaths();
    deferred = _this._compressCode(compressPaths);
  }

  return deferred
      .then(function(compressedCodeBuffer) {
        var zippedFilePath = path.join(_this._distDir, 'package.zip'); // Save for auditing;
        fs.writeFileSync(zippedFilePath, compressedCodeBuffer);

        JawsCLI.log('Lambda Deployer:  Compressed lambda written to ' + zippedFilePath);

        return Promise.resolve({jawsFilePath: _this._lambdaPath, zipBuffer: compressedCodeBuffer});
      });
});

/**
 * Packager: Optimize NodeJs
 */

Packager.prototype._optimizeNodeJs = Promise.method(function() {

  var _this = this;

  if (!_this._lambdaJson.lambda.package.optimize
      || !_this._lambdaJson.lambda.package.optimize.builder) {
    throw new JawsError('Cant optimize for nodejs. lambda jaws.json does not have optimize.builder set');
  }

  if (_this._lambdaJson.lambda.package.optimize.builder.toLowerCase() == 'browserify') {
    return _this._browserifyBundle();
  } else {
    throw new JawsError('Unsupported builder ' + builder);
  }
});

/**
 * Packager: Browserify Bundle
 */

Packager.prototype._browserifyBundle = Promise.method(function() {

  var _this = this;
  var uglyOptions = {
    mangle: true, // @see http://lisperator.net/uglifyjs/compress
    compress: {},
  };
  var b = browserify({
    basedir: path.join(_this._distDir, 'back'),
    entries: [_this._lambdaJson.lambda.handler.split('.')[0] + '.js'],
    standalone: 'lambda',
    browserField: false,  // Setup for node app (copy logic of --node in bin/args.js)
    builtins: false,
    commondir: false,
    detectGlobals: true,  // Default for bare in cli is true, but we don't care if its slower
    insertGlobalVars: {   // Handle process https://github.com/substack/node-browserify/issues/1277
      //__filename: insertGlobals.vars.__filename,
      //__dirname: insertGlobals.vars.__dirname,
      process: function() {
      },
    },
  });

  // optimize.exclude
  _this._lambdaJson.lambda.package.optimize.exclude.forEach(function(file) {
    b.exclude(file);
  });

  // optimize.ignore
  _this._lambdaJson.lambda.package.optimize.ignore.forEach(function(file) {
    b.ignore(file);
  });

  // Perform Bundle
  var bundledFilePath = path.join(_this._distDir, 'bundled.js');   // Save for auditing
  var minifiedFilePath = path.join(_this._distDir, 'minified.js'); // Save for auditing

  return new Promise(function(resolve, reject) {
    b.bundle(function(err, bundledBuf) {
      if (err) {
        console.error('Error running browserify bundle');
        reject(err);
      } else {
        fs.writeFileSync(bundledFilePath, bundledBuf);
        JawsCLI.log('Lambda Deployer:  Bundled file written to ' + bundledFilePath);

        if (_this._lambdaJson.lambda.package.optimize.exclude) {
          var result = UglifyJS.minify(bundledFilePath, uglyOptions);

          if (!result || !result.code) {
            reject(new JawsError('Problem uglifying code'));
          }

          fs.writeFileSync(minifiedFilePath, result.code);

          JawsCLI.log('Lambda Deployer:  Minified file written to ' + minifiedFilePath);
          resolve(result.code);
        } else {
          resolve(bundledBuf);
        }
      }
    });
  });
});

/**
 * Packager: Generate Include Paths
 */

Packager.prototype._generateIncludePaths = function() {

  var _this = this;
  var compressPaths = [];
  var ignore = ['.ds_store'];

  _this._lambdaJson.lambda.package.optimize.includePaths.forEach(function(p) {
    try {
      var fullPath = path.resolve(path.join(_this._distDir, 'back', p));
      var stats = fs.lstatSync(fullPath);
    } catch (e) {
      console.error('Cant find includePath ', p, e);
      throw e;
    }

    if (stats.isFile()) {
      compressPaths.push({fileName: p, data: fullPath});
    } else if (stats.isDirectory()) {
      wrench
          .readdirSyncRecursive(fullPath)
          .forEach(function(file) {

            // Ignore certain files
            for (var i = 0; i < ignore.length; i++) {
              if (file.toLowerCase().indexOf(ignore[i]) > -1) return;
            }

            var filePath = [fullPath, file].join('/');
            if (fs.lstatSync(filePath).isFile()) {
              compressPaths.push({fileName: file, data: fs.readFileSync(filePath)});
            }
          });
    }
  });

  return compressPaths;
};

/**
 * Packager: Compress Code
 */

Packager.prototype._compressCode = Promise.method(function(compressPaths) {

  var _this = this;
  var zip = new Zip();

  compressPaths.forEach(function(nc) {
    zip.file(nc.fileName, nc.data);
  });

  var zippedData = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  if (zippedData.length > 52428800) {
    reject(new JawsError(
            'Zip file is > the 50MB Lambda deploy limit (' + zippedData.length + ' bytes)',
            JawsError.errorCodes.ZIP_TOO_BIG)
    );
  }

  return Promise.resolve(zippedData);
});
