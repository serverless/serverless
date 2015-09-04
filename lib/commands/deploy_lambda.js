'use strict';

/**
 * JAWS Command: deploy lambda <stage>
 * - Deploys project's lambda(s) to the specified stage
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    async = require('async'),
    AWS = require('aws-sdk'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils/index'),
    browserify = require('browserify'),
    UglifyJS = require('uglify-js'),
    wrench = require('wrench'),
    Zip = require('node-zip');

Promise.promisifyAll(fs);

/**
 * I know this is a long func name..
 *
 * @param JAWS
 * @param region
 * @param stage
 * @private
 */
function _validateJawsProjAttrsForLambdaDeploy(JAWS, region, stage) {
  if (!JAWS._meta.projectJson.project.stages[stage]) {
    throw new JawsError(
        stage + ' not setup in project jaws.json',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  var regionObj = utils.getProjRegionConfig(JAWS._meta.projectJson.project.stages[stage], region);

  if (!regionObj.iamRoleArn) {
    throw new JawsError(
        'iamRoleArn stage ' + stage + ' in region ' + region + ' not setup in project jaws.json',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }
}

/**
 * Copy source back dir to temp dir, excluding paths
 *
 * @param srcBackDir
 * @param targetBackDir
 * @param excludePatterns list of regular expressions
 */
function copyBackDirToTmp(srcBackDir, targetBackDir, excludePatterns) {
  wrench.copyDirSyncRecursive(srcBackDir, targetBackDir, {
    exclude: function(name, prefix) {
      if (!excludePatterns.length) {
        return false;
      }

      var relPath = path.join(prefix.replace(srcBackDir, ''), name);

      return excludePatterns.some(function(sRegex) {
        relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

        var re = new RegExp(sRegex),
            matches = re.exec(relPath);

        var willExclude = (matches && matches.length > 0);

        if (willExclude) {
          utils.logIfVerbose('Excluding ' + relPath);
        }

        return willExclude;
      });
    },
  });
}

/**
 * make zips for each lambda tagged as deployable
 *
 * @param JAWS
 * @param lambdaJawsPaths
 * @param stage
 * @returns {Promise} [{jawsFilePath:'/path/to',zipBuffer:zippedData,fullLambdaName:'stage_-_proj-name_-_lambdaName'}]
 * @private
 */
function _makeLambdaPackages(JAWS, lambdaJawsPaths, stage) {
  var deployableJawsFiles = JAWS.getDeployableLambdas(lambdaJawsPaths),
      builderQueue = [];

  deployableJawsFiles.forEach(function(jawsFile) {
    builderQueue.push(JAWS.bundleLambda(jawsFile, stage));
  });

  if (!builderQueue.length) {
    throw new JawsError(
        'No lambdas tagged as needing to be deployed',
        JawsError.errorCodes.NO_LAMBDAS_TAGGED_DEPLOYABLE
    );
  }

  return Promise.all(builderQueue);
}

/**
 * For each region, deploy all lambda packages
 *
 * @param JAWS
 * @param {[]} packagedLambdas [{jawsFilePath:'/path/to',zipBuffer:zip,fullLambdaName:'stage_-_proj-name_-_lambdaName'}]
 * @param stage
 * @param {boolean} allAtOnce deploy all at once. default one at a time
 * @param {string} region. Optional. If specified will only deploy to one region
 * @returns {Promise} map of regions to lambda arns deployed {'us-east-1':['arn1','arn2']}
 * @private
 */
function _deployLambasInAllRegions(JAWS, packagedLambdas, stage, allAtOnce, region) {
  var regions = (region) ? [region] : Object.keys(JAWS._meta.projectJson.project.regions),
      deployedArnsByRegion = {};

  return new Promise(function(resolve, reject) {
    async.each(regions, function(region, regionCB) {  //Loop over each region
          _validateJawsProjAttrsForLambdaDeploy(JAWS, region, stage);

          deployedArnsByRegion[region] = [];

          AWSUtils.configAWS(JAWS._meta.profile, region);

          //Concurrent queue to deploy each lambda
          var concurrentDeploys = (allAtOnce) ? 10 : 1;//fake deploy all at once, imagine 100 25meg uploads...

          var q = async.queue(function(task, cb) {
            JAWS.createOrUpdateLambda(
                task.jawsFilePath,
                task.zipBuffer,
                task.fullLambdaName,
                utils.getProjRegionConfig(JAWS._meta.projectJson.project.stages[stage], region).iamRoleArn
            )
                .then(function() {
                  deployedArnsByRegion[region].push(task.fullLambdaName);
                  JAWS.tag('lambda', task.jawsFilePath, true);
                  cb();
                })
                .error(function(createErr) {
                  console.error('Error creating/updating', task.fullLambdaName, 'in', region, createErr);
                  cb(createErr);
                });
          }, concurrentDeploys);

          q.drain = function() {  //done with all the lambdas in this region
            regionCB();
          };

          packagedLambdas.forEach(function(lambdaPackage) {
            q.push({
                  jawsFilePath: lambdaPackage.jawsFilePath,
                  zipBuffer: lambdaPackage.zipBuffer,
                  fullLambdaName: lambdaPackage.fullLambdaName,
                },
                function(deployError) { //if deploy error for any individual, dont deploy the rest
                  if (deployError) {
                    q.kill();
                    regionCB(deployError);
                  }
                });
          });
        },

        function(err) { //end of all regions, success or fail
          if (err) {
            console.error('Problem deploying to region(s)', err);
            reject(new JawsError(
                'Problem deploying to region(s)',
                JawsError.errorCodes.INVALID_PROJECT_JAWS
            ));
          } else {  //Done deploying all lambdas to all regions
            resolve(deployedArnsByRegion);
          }
        });
  });
}

function systemJsBundle(baseDir, entries, tmpDistDir, minify, mangle, excludeFiles, ignoreFiles) {
  return Promise.reject(new JawsError('Systemjs not yet supported', JawsError.errorCodes.UNKNOWN));
}

/**
 * Complie and optionally minify
 *
 * @param baseDir
 * @param entries
 * @param tmpDistDir
 * @param minify
 * @param mangle
 * @param excludes see https://github.com/substack/browserify-handbook#ignoring-and-excluding
 * @param ignores see https://github.com/substack/browserify-handbook#ignoring-and-excluding
 * @returns {Promise} NodeBuffer of bundled code
 */
function browserifyBundle(baseDir, entries, tmpDistDir, minify, mangle, excludes, ignores) {
  var bundledFilePath = path.join(tmpDistDir, 'bundled.js'),     //save for auditing
      minifiedFilePath = path.join(tmpDistDir, 'minified.js'),    //save for auditing
      uglyOptions = {
        mangle: mangle,
        compress: {}, //@see http://lisperator.net/uglifyjs/compress
      },
      b = browserify({
        basedir: baseDir,
        entries: entries,
        standalone: 'lambda',

        //setup for node app (copy logic of --node in bin/args.js)
        browserField: false,
        builtins: false,
        commondir: false,
        detectGlobals: true,  //default for bare in cli is true, but we dont care if its slower

        //handle process https://github.com/substack/node-browserify/issues/1277
        insertGlobalVars: {
          //__filename: insertGlobals.vars.__filename,
          //__dirname: insertGlobals.vars.__dirname,
          //process: insertGlobals.vars.process,
          process: function() {
            return;
          },
        },
      });

  excludes.forEach(function(file) {
    b.exclude(file);
  });

  ignores.forEach(function(file) {
    b.ignore(file);
  });

  return new Promise(function(resolve, reject) {
    b
        .bundle(function(err, bundledBuf) {
          if (err) {
            console.error('Error running browserify bundle');
            reject(err);
          } else {
            fs.writeFileSync(bundledFilePath, bundledBuf);
            utils.logIfVerbose('bundled file wrote to ' + bundledFilePath);
            if (minify) {
              var result = UglifyJS.minify(bundledFilePath, uglyOptions);
              if (!result || !result.code) {
                reject(new JawsError('Problem uglifying code'), JawsError.errorCodes.UNKNOWN);
              }

              fs.writeFileSync(minifiedFilePath, result.code);
              utils.logIfVerbose('minified file wrote to ' + minifiedFilePath);
              resolve(result.code);
            } else {
              resolve(bundledBuf);
            }
          }
        });
  });
}

/**
 *
 * @param tmpDistDir
 * @param includePaths relative to back dir
 * @returns {[]} of {fileName: '', data: fullPath}
 */
function generateIncludePaths(tmpDistDir, includePaths) {
  var compressPaths = [],
      backDirPath = path.join(tmpDistDir, 'back');

  includePaths.forEach(function(p) {
    try {
      var fullPath = path.resolve(path.join(backDirPath, p)),
          stats = fs.lstatSync(fullPath);
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
            var filePath = [fullPath, file].join('/');
            if (fs.lstatSync(filePath).isFile()) {
              compressPaths.push({fileName: file, data: fs.readFileSync(filePath)});
            }
          });
    }
  });

  return compressPaths;
}

module.exports = function(JAWS) {
  /**
   * Filter lambda dirs down to those marked as deployable
   *
   * @param lambdaJawsPaths list of full paths to lambda jaws.json files
   * @returns {[]} of full paths to jaws.json files
   * @private
   */
  JAWS.getDeployableLambdas = function(lambdaJawsPaths) {
    return lambdaJawsPaths.filter(function(jawsPath) {
      var jawsJson = require(jawsPath);

      return (jawsJson.lambda.deploy === true);
    });
  };

  /**
   * Optmize code. Assumes entire back directory was already copied to tmpDistDir
   *
   * @param tmpDistDir
   * @param jawsFilePath
   * @returns {Promise} Node Buffer of optimized code
   */
  JAWS.optimizeNodeJs = function(tmpDistDir, jawsFilePath) {
    var backDir = path.join(tmpDistDir, 'back'),  //path.dirname(jawsFilePath),
        lambdaJson = require(jawsFilePath),
        optimizeData = lambdaJson.lambda.package.optimize;

    if (!optimizeData || !optimizeData.builder) {
      return Promise.reject(
          new JawsError('Cant optimize for nodejs. lambda jaws.json does not have optimize.builder set'),
          JawsError.errorCodes.UNKNOWN
      );
    }

    var exclude = optimizeData.exclude || [],
        ignore = optimizeData.ignore || [],
        handlerFileName = lambdaJson.lambda.handler.split('.')[0],
        builder = optimizeData.builder || 'browserify',
        minify = (optimizeData.minify !== false),
        entries = [handlerFileName + '.js'],  //rel to back dir
        mangle = true;

    builder = builder.toLowerCase();

    if (builder == 'systemjs') {
      return systemJsBundle(backDir, entries, tmpDistDir, minify, mangle, exclude, ignore);
    } else if (builder == 'browserify') {
      return browserifyBundle(backDir, entries, tmpDistDir, minify, mangle, exclude, ignore);
    } else {
      return Promise.reject(
          new JawsError('Unsupported builder ' + builder),
          JawsError.errorCodes.UNKNOWN
      );
    }
  };

  /**
   * compress and save as zip node buffer
   *
   * will always include projects env var
   *
   * @param stage
   * @param {[]} fileNameData [{filename:'blah.js',data:String/ArrayBuffer/Uint8Array/Buffer}]
   * @returns {Promise} Buffer of compressed package
   */
  JAWS.compressCode = function(stage, fileNameData) {
    var zip = new Zip();

    fileNameData.forEach(function(nc) {
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
  };

  /**
   * Package up nodejs lambda
   *
   * @param tmpDistDir
   * @param lambdaJawsFilePath path to lambda specific jaws.json file
   * @param stage
   * @returns {Promise} {jawsFilePath: jawsFilePath,zipBuffer:zippedData}
   * @private
   */
  JAWS.packageNodeJs = function(tmpDistDir, lambdaJawsFilePath, stage) {
    var _this = this,
        jawsJson = require(lambdaJawsFilePath),
        includePaths = jawsJson.lambda.package.includePaths || [],
        deferred = null;

    if (jawsJson.lambda.package && jawsJson.lambda.package.optimize && jawsJson.lambda.package.optimize.builder) {
      deferred = _this.optimizeNodeJs(tmpDistDir, lambdaJawsFilePath)
          .then(function(optimizedCodeBuffer) {
            //Lambda freaks out if code doesnt end in newline
            var ocbWithNewline = optimizedCodeBuffer.concat(new Buffer('\n'));

            var handlerFileName = jawsJson.lambda.handler.split('.')[0],
                compressPaths = [

                  //handlerFileName is the full path lambda file including dir rel to back
                  {fileName: handlerFileName + '.js', data: ocbWithNewline},
                  {fileName: '.env', data: path.join(tmpDistDir, 'back', '.env')},
                ];

            if (includePaths.length) {
              compressPaths = compressPaths.concat(generateIncludePaths(tmpDistDir, includePaths));
            }

            return _this.compressCode(stage, compressPaths);
          });
    } else {  //user chose not to optimize, zip up whatever is in back
      var compressPaths = generateIncludePaths(tmpDistDir, ['.']);
      deferred = _this.compressCode(stage, compressPaths);
    }

    return deferred
        .then(function(compressedCodeBuffer) {
          var zippedFilePath = path.join(tmpDistDir, 'package.zip');    //save for auditing;
          fs.writeFileSync(zippedFilePath, compressedCodeBuffer);

          utils.logIfVerbose('compressed file wrote to ' + zippedFilePath);

          return {jawsFilePath: lambdaJawsFilePath, zipBuffer: compressedCodeBuffer};
        });
  };

  /**
   * Create lambda package for deployment
   *
   * @param jawsFilePath lambda jaws file path
   * @param stage
   * @returns {Promise} {jawsFilePath:jawsFilePath,zipBuffer:zippedData,fullLambdaName:'stage_-_proj-name_-_lambdaName'}
   * @private
   */
  JAWS.bundleLambda = function(jawsFilePath, stage) {
    var _this = this,
        jawsJson = require(jawsFilePath),
        projName = _this._meta.projectJson.name,
        fullLambdaName = [stage, projName, jawsJson.lambda.functionName].join('_-_'),
        d = new Date(),
        tmpDistDir = path.join(os.tmpdir(), fullLambdaName + '@' + d.getTime()),
        srcBackDir = path.join(_this._meta.projectRootPath, 'back'),
        targetBackDir = path.join(tmpDistDir, 'back'),
        excludePatterns = jawsJson.lambda.package.excludePatterns || [];

    console.log('Packaging', fullLambdaName, 'in dist dir', tmpDistDir);

    fs.mkdirSync(tmpDistDir);

    //Copy back dir omitting excludePatterns
    copyBackDirToTmp(srcBackDir, targetBackDir, excludePatterns);

    return AWSUtils.getEnvFile(
        _this._meta.profile,
        _this._meta.projectJson.project.envVarBucket.region,
        _this._meta.projectJson.project.envVarBucket.name,
        projName,
        stage
    )
        .then(function(s3ObjData) {
          //always add env file at root of back
          fs.writeFileSync(path.join(targetBackDir, '.env'), s3ObjData.Body);

          switch (jawsJson.lambda.runtime) {
            case 'nodejs':
              return _this.packageNodeJs(
                  tmpDistDir,
                  jawsFilePath,
                  stage
              )
                  .then(function(packageData) {
                    packageData.fullLambdaName = fullLambdaName;
                    return packageData;
                  });

              break;
            default:
              return Promise.reject(new JawsError(
                  'Unsupported lambda runtime ' + jawsJson.lambda.runtime,
                  JawsError.errorCodes.UNKNOWN));
              break;
          }
        });
  };

  /**
   * Create or update lambda if it exists
   *
   * @param lambdaJawsFilePath
   * @param zipBuffer
   * @param fullLambdaName
   * @param iamRole
   * @returns {Promise} lambda function arn
   * @private
   */
  JAWS.createOrUpdateLambda = function(lambdaJawsFilePath, zipBuffer, fullLambdaName, iamRole) {
    var lambdaJawsJson = require(lambdaJawsFilePath),
        l = new AWS.Lambda({ //don't put into AWSUtils because we may want to use diff apiVersion
          apiVersion: '2015-03-31',
        }),
        lambdaGetFunctionAsync = Promise.promisify(l.getFunction, l),
        lUpdateFunctionCodeAsync = Promise.promisify(l.updateFunctionCode, l),
        lUpdateFunctionConfigurationAsync = Promise.promisify(l.updateFunctionConfiguration, l);

    var params = {
      FunctionName: fullLambdaName,
      Handler: lambdaJawsJson.lambda.handler,
      Role: iamRole,
      Runtime: lambdaJawsJson.lambda.runtime,
      Description: lambdaJawsJson.description,
      MemorySize: lambdaJawsJson.lambda.memorySize,
      Timeout: lambdaJawsJson.lambda.timeout,
    };

    return lambdaGetFunctionAsync({FunctionName: fullLambdaName})
        .then(function() {  //Function already exists, so update :)
          console.log('updating', fullLambdaName);

          return lUpdateFunctionCodeAsync({
            FunctionName: fullLambdaName,
            ZipFile: zipBuffer,
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
            console.error('Error trying to create/update', fullLambdaName, e);
            throw new JawsError(e.message, JawsError.errorCodes.UNKNOWN);
          }

          //create new lambda
          console.log('creating', fullLambdaName);
          var lambdaCreateFunctionAsync = Promise.promisify(l.createFunction, l);

          params.Code = {ZipFile: zipBuffer};

          return lambdaCreateFunctionAsync(params);
        })
        .then(function(data) {
          return data.FunctionArn;
        });
  };

  /**
   * Deploy lambda at cwd or if deployAll is true does all tag'd lambdas under back dir
   *
   * @param stage
   * @param {boolean} deployAllTagged optional. by default deploys cwd
   * @param {boolean} allAtOnce by default one lambda will be deployed at a time
   * @param {string} region. optional. Only deploy to this region. if only 1 region defined for stage will use it.
   * @returns {Promise} map of region to list of lambda names deployed
   */
  JAWS.deployLambdas = function(stage, deployAllTagged, allAtOnce, region) {
    var _this = this;

    if (!_this._meta.projectJson.project.stages[stage]) {
      return Promise.reject(new JawsError('Invalid stage ' + stage, JawsError.errorCodes.UNKNOWN));
    }

    if (region) {
      utils.getProjRegionConfig(_this._meta.projectJson.project.stages[stage], region); //make sure region defined
    } else {
      if (_this._meta.projectJson.project.stages[stage].length == 1) {  //config only has 1 region
        region = _this._meta.projectJson.project.stages[stage][0].region;
        console.log('Only one region', region, 'defined for stage, so using it');
      }
    }

    return utils.checkForDuplicateLambdaNames(_this._meta.projectRootPath)
        .then(function(allLambdaJawsPaths) {
          if (deployAllTagged) {
            return allLambdaJawsPaths;
          } else {
            return JAWS.tag('lambda')
                .then(function() {
                  return Promise.resolve([path.join(process.cwd(), 'jaws.json')]);
                });
          }
        })
        .then(function(lambdaJawsPaths) { //Step 1: make zips for each lambda tagged as deployable
          return _makeLambdaPackages(_this, lambdaJawsPaths, stage);
        })
        .then(function(packagedLambdas) { //Step 2: For each region, deploy all lambda packages
          return _deployLambasInAllRegions(_this, packagedLambdas, stage, allAtOnce, region);
        });
  };
};
