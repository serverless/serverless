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

  if (!JAWS._meta.projectJson.project.regions[region][stage]) {
    throw new JawsError(
        'Stage ' + stage + ' for region ' + region + ' not setup in project jaws.json',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  if (!JAWS._meta.projectJson.project.regions[region][stage].iamRoleArn) {
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
 * @returns {Promise} [{jawsFilePath:'/path/to',zipBuffer:zippedData,fullLambdaName:'stage_-_proj-name_-_lambdaName'}]
 * @private
 */
function _makeLambdaPackages(JAWS, lambdaJawsPaths) {
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
 * @returns {Promise} map of regions to lambda arns deployed {'us-east-1':['arn1','arn2']}
 * @private
 */
function _deployLambasInAllRegions(JAWS, packagedLambdas) {
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

          AWSUtils.configAWS(JAWS._meta.profile, region);

          //Concurrent queue to deploy each lambda
          var concurrentDeploys = (allAtOnce) ? 10 : 1;//fake deploy all at once, imagine 100 25meg uploads...

          var q = async.queue(function(task, cb) {
            JAWS.createOrUpdateLambda(
                task.jawsFilePath,
                task.zipBuffer,
                task.fullLambdaName,
                region,
                JAWS._meta.projectJson.project.regions[region][stage].iamRoleArn
            )
                .then(function() {
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

  JAWS.optimizeNodeJs = function(tmpDistDir, jawsFilePath, excludeFiles, ignoreFiles) {
    var jawsJson = require(jawsFilePath),
        handlerFileName = jawsJson.lambda.handler.split('.')[0],
        baseDir = path.dirname(jawsFilePath),
        b = browserify({
          entries: path.join(baseDir, handlerFileName + '.js'),
          node: true,
          standalone: 'lambda',
          basedir: baseDir,
        });

    excludeFiles.forEach(function(file) {
      b.exclude(file);
    });

    ignoreFiles.forEach(function(file) {
      b.ignore(file);
    });

    var uglyOptions = {
      mangle: true,
      compress: {}, //@see http://lisperator.net/uglifyjs/compress
    };

    return new Promise(function(resolve, reject) {
      //Save the browserfied js to so we have audit trail
      //TODO: check how browserfy handles __dirname requires
      var broserfiedFile = path.join(tmpDistDir, 'browserfied.js'),
          uglifiedFile = path.join(tmpDistDir, 'index.js'),
          bFile = fs.createWriteStream(broserfiedFile);
      b.bundle().pipe(bFile);

      bFile
          .on('finish', function() {
            //uglify and save as index.js
            var result = UglifyJS.minify(broserfiedFile, uglyOptions); //minify does not expose its internal stream :(

            if (!result || !result.code) {
              reject(new JawsError('Problem uglifying code'), JawsError.errorCodes.UNKNOWN);
            }

            fs.writeFileSync(uglifiedFile, result.code);

            //compress and save as zip node buffer
            zip.file(handlerFileName + '.js', result.code);

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

            resolve({jawsFilePath: jawsFilePath, zipBuffer: zippedData});
          })
          .on('error', function(err) {
            reject(err);
          });
    });
  };

  /**
   * Package up nodejs lambda
   *
   * @param tmpDistDir
   * @param jawsFilePath path to lambda specific jaws.json file
   * @param {list} excludeFiles @see https://github.com/substack/node-browserify#usage
   * @param {list} ignoreFiles @see https://github.com/substack/node-browserify#usage
   * @param ignoreFiles
   * @param {boolean} skipOptimize
   * @returns {Promise} {jawsFilePath: jawsFilePath,zipBuffer:zippedData}
   * @private
   */
  JAWS.packageNodeJs = function(tmpDistDir, jawsFilePath, excludeFiles, ignoreFiles, skipOptimize) {
    if (!skipOptimize) {
      return this.optimizeNodeJs(tmpDistDir, jawsFilePath, excludeFiles, ignoreFiles);
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
        fullLambdaName = [stage, projName, jawsJson.lambda.name].join('_-_'),
        tmpDistDir = path.join(os.tmpdir(), fullLambdaName + '@' + new Date());

    console.log('Creating dist for', fullLambdaName, 'in tmp dir', tmpDistDir);

    fs.mkdirSync(tmpDistDir);

    switch (jawsJson.lambda.runtime) {
      case 'nodejs':
        var skipOptimize = (!jawsJson.lambda.optimize);
        return _this.packageNodeJs(
            tmpDistDir,
            jawsFilePath,
            jawsJson.lambda.excludeFiles,
            jawsJson.lambda.ignoreFiles,
            skipOptimize
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
        lambdaGetFunctionAsync = Promise.promisify(l.getFunction, l);

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

          var lUpdateFunctionCodeAsync = Promise.promisify(l.updateFunctionCode, l),
              lUpdateFunctionConfigurationAsync = Promise.promisify(l.updateFunctionConfiguration, l);

          return lUpdateFunctionCodeAsync({
            FunctionName: fullLambdaName,
            ZipFile: zipBuffer,
          })
              .then(function() {
                return lUpdateFunctionConfigurationAsync(params);
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
   * @returns {Promise}
   */
  JAWS.deployLambdas = function(stage, deployAllTagged, allAtOnce) {
    var _this = this,
        lambdasPromise;

    if (deployAllTagged) {
      lambdasPromise = utils.findAllLambdas(JAWS._meta.projectRootPath);
    } else {
      lambdasPromise = JAWS.tag()
          .then(function() {
            return Promise.resolve([process.cwd()]);
          });
    }

    return lambdasPromise
        .then(function(lambdaJawsPaths) { //Step 1: make zips for each lambda tagged as deployable
          return _makeLambdaPackages(_this, lambdaJawsPaths);
        })
        .then(function(packagedLambdas) { //Step 2: For each region, deploy all lambda packages
          return _deployLambasInAllRegions(_this, packagedLambdas);
        });
  };
};
