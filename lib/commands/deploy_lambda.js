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
    insertGlobals = require('insert-module-globals'),
    UglifyJS = require('uglify-js'),
    Builder = require('systemjs-builder'),
    zip = new require('node-zip')(),
    extend = require('util')._extend; //OK per Isaacs and http://stackoverflow.com/a/22286375/563420

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
  if (!JAWS._meta.projectJson.project.regions[region]) {
    throw new JawsError(
        'Region ' + region + ' not setup in project jaws.json',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  if (!JAWS._meta.projectJson.project.regions[region].stages) {
    throw new JawsError(
        'Stages attr for region ' + region + ' not setup in project jaws.json',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  var stages = JAWS._meta.projectJson.project.regions[region].stages;

  if (!stages[stage]) {
    throw new JawsError(
        'Stage ' + stage + ' for region ' + region + ' not setup in project jaws.json',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  if (!stages[stage].iamRoleArn) {
    throw new JawsError(
        'iamRoleArn not set for stage ' + stage + ' in region ' + region + ' not setup in project jaws.json',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }
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
 * @returns {Promise} map of regions to lambda arns deployed {'us-east-1':['arn1','arn2']}
 * @private
 */
function _deployLambasInAllRegions(JAWS, packagedLambdas, stage, allAtOnce) {
  if (!JAWS._meta.projectJson.project.regions) {
    throw new JawsError(
        'Regions not setup in project jaws.json project attr',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  var regions = Object.keys(JAWS._meta.projectJson.project.regions),
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
                JAWS._meta.projectJson.project.regions[region].stages[stage].iamRoleArn
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

function systemJsBundle(baseDir, entries, tmpDistDir, minify, mangle, excludeFiles, ignoreFiles, includePaths) {
  return new Promise(function(reject, resolve) {
    var bundledFilePath = path.join(tmpDistDir, 'bundled.js'),     //save for auditing
        minifiedFilePath = path.join(tmpDistDir, 'minified.js'),    //save for auditing
        builder = new Builder({
          baseURL: baseDir,
        })
            .build(entries[0], bundledFilePath, {minify: minify, mangle: mangle})
            .then(function(output) {
              resolve(output.source);
            })
            .catch(function(err) {
              reject(err);
            });
  });
}

/**
 * Complie and optionally minify
 *
 * @param baseDir
 * @param entries
 * @param tmpDistDir
 * @param minify
 * @param mangle
 * @param excludeFiles
 * @param ignoreFiles
 * @param includePaths
 * @returns {Promise} NodeBuffer of bundled code
 */
function browserifyBundle(baseDir, entries, tmpDistDir, minify, mangle, excludeFiles, ignoreFiles, includePaths) {
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

  excludeFiles.forEach(function(file) {
    b.exclude(file);
  });

  ignoreFiles.forEach(function(file) {
    b.ignore(file);
  });

  return new Promise(function(resolve, reject) {
    b
        .bundle(function(err, bundledBuf) {
          if (err) {
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
   *
   * @param tmpDistDir
   * @param jawsFilePath
   * @returns {Promise} Node Buffer of optimized code
   */
  JAWS.optimizeNodeJs = function(tmpDistDir, jawsFilePath) {
    var baseDir = path.dirname(jawsFilePath),
        lambdaJson = require(jawsFilePath),
        excludeFiles = lambdaJson.lambda.excludeFiles || [],
        ignoreFiles = lambdaJson.lambda.ignoreFiles || [],
        includePaths = lambdaJson.lambda.includePaths || [],
        handlerFileName = lambdaJson.lambda.handler.split('.')[0],
        builder = lambdaJson.lambda.build,  //Not currently used, for future proof
        minify = (lambdaJson.lambda.minify === false) ? lambdaJson.lambda.minify : true,
        entries = [path.join(baseDir, handlerFileName + '.js')],
        mangle = true;

    builder = 'browserify'; //we only spport this ATM

    if (builder == 'systemjs') {
      return systemJsBundle(baseDir, entries, tmpDistDir, minify, mangle, excludeFiles, ignoreFiles, includePaths);
    } else if (builder == 'browserify') {
      return browserifyBundle(baseDir, entries, tmpDistDir, minify, mangle, excludeFiles, ignoreFiles, includePaths);
    } else {
      return Promise.reject(new JawsError('lambda has build set to false'), JawsError.errorCodes.UNKNOWN);
    }
  };

  /**
   * compress and save as zip node buffer
   *
   * will always include projects env var
   *
   * @param stage
   * @param {[]} nameContentPairs [{filename:'blah.js',content:NodeBuffer}]
   * @returns {Promise} NodeBuffer of compressed package
   */
  JAWS.compressCode = function(stage, nameContentPairs) {
    var _this = this,
        projectName = this._meta.projectJson.name,
        projectBucketRegion = this._meta.projectJson.project.envVarBucket.region,
        projectBucketName = this._meta.projectJson.project.envVarBucket.name;

    return AWSUtils.getEnvFile(
        _this._meta.profile,
        projectBucketRegion,
        projectBucketName,
        projectName,
        stage
    )
        .then(function(s3ObjData) {
          zip.file('.env', s3ObjData.Body);

          nameContentPairs.forEach(function(nc) {
            zip.file(nc.fileName, nc.content);
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

          return zippedData;
        });
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
        jawsJson = require(lambdaJawsFilePath);

    if (jawsJson.lambda.build) {
      return _this.optimizeNodeJs(tmpDistDir, lambdaJawsFilePath)
          .then(function(optimizedCodeBuffer) {
            var handlerFileName = jawsJson.lambda.handler.split('.')[0];

            return _this.compressCode(stage, [{fileName: handlerFileName + '.js', content: optimizedCodeBuffer}]);
          })
          .then(function(compressedCodeBuffer) {
            var zippedFilePath = path.join(tmpDistDir, 'package.zip');    //save for auditing;
            fs.writeFileSync(zippedFilePath, compressedCodeBuffer);

            utils.logIfVerbose('compressed file wrote to ' + zippedFilePath);

            return {jawsFilePath: lambdaJawsFilePath, zipBuffer: compressedCodeBuffer};
          });
    } else {
      //TODO: figure this out https://github.com/aws/aws-sdk-js/issues/383
    }
  };

  /**
   * Create lambda package for deployment
   *
   * @param jawsFilePath
   * @param stage
   * @param {list} excludeFiles
   * @param {list} ignoreFiles
   * @param {boolean} skipOptimize
   * @returns {Promise} {jawsFilePath:jawsFilePath,zipBuffer:zippedData,fullLambdaName:'stage_-_proj-name_-_lambdaName'}
   * @private
   */
  JAWS.bundleLambda = function(jawsFilePath, stage) {
    var _this = this,
        jawsJson = require(jawsFilePath),
        projName = JAWS._meta.projectJson.name,
        fullLambdaName = [stage, projName, jawsJson.lambda.functionName].join('_-_'),
        d = new Date(),
        tmpDistDir = path.join(os.tmpdir(), fullLambdaName + '@' + d.getTime());

    console.log('Packaging', fullLambdaName, 'in dist dir', tmpDistDir);

    fs.mkdirSync(tmpDistDir);

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
        .then(function(data) {  //Function already exists, so update :)
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
   * @returns {Promise} map of region to list of lambda names deployed
   */
  JAWS.deployLambdas = function(stage, deployAllTagged, allAtOnce) {
    var _this = this,
        lambdasPromise;

    if (deployAllTagged) {
      lambdasPromise = utils.findAllLambdas(JAWS._meta.projectRootPath);
    } else {
      lambdasPromise = JAWS.tag('lambda')
          .then(function() {
            return Promise.resolve([path.join(process.cwd(), 'jaws.json')]);
          });
    }

    return lambdasPromise
        .then(function(lambdaJawsPaths) { //Step 1: make zips for each lambda tagged as deployable
          return _makeLambdaPackages(_this, lambdaJawsPaths, stage);
        })
        .then(function(packagedLambdas) { //Step 2: For each region, deploy all lambda packages
          return _deployLambasInAllRegions(_this, packagedLambdas, stage, allAtOnce);
        });
  };
};
