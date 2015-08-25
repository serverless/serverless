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

module.exports = function(JAWS) {
  /**
   * Filter lambda dirs down to those marked as deployable
   *
   * @param lambdaJawsPaths list of full paths to lambda jaws.json files
   * @returns {[]} of full paths to jaws.json files
   * @private
   */
  JAWS._getDeployableLambdas = function(lambdaJawsPaths) {
    return lambdaJawsPaths.filter(function(jawsPath) {
      var jawsJson = require(jawsPath);

      return (jawsJson.lambda.deploy === true);
    });
  };

  JAWS._optimizeNodeJs = function(tmpDistDir, jawsFilePath, excludeFiles, ignoreFiles) {
    var jawsJson = require(jawsFilePath),
        handlerFileName = jawsJson.lambda.handler.split('.')[0],
        baseDir = path.dirname(jawsFilePath),
        b = browserify({
          entries: path.join(baseDir, 'index.js'),
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
  JAWS._packageNodeJs = function(tmpDistDir, jawsFilePath, excludeFiles, ignoreFiles, skipOptimize) {
    if (!skipOptimize) {
      return this._optimizeNodeJs(tmpDistDir, jawsFilePath, excludeFiles, ignoreFiles);
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
  JAWS._bundleLambda = function(jawsFilePath, stage) {
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
        return _this._packageNodeJs(
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

  JAWS._createOrUpdateLambda = function(lambdaJawsFilePath, zipBuffer, fullLambdaName, iamRole) {
    var lambdaJawsJson = require(lambdaJawsFilePath),
        lambda = Promise.promisifyAll(new AWS.Lambda({ //don't put into AWSUtils because we may want to use diff apiVersion
          apiVersion: '2015-03-31',
        }));

    var params = {
      FunctionName: fullLambdaName,
      Handler: lambdaJawsJson.lambda.handler,
      Role: iamRole,
      Runtime: lambdaJawsJson.lambda.runtime,
      Description: lambdaJawsJson.description,
      MemorySize: lambdaJawsJson.lambda.memorySize,
      Timeout: lambdaJawsJson.lambda.timeout,
    };

    lambda.getFunctionAsync({FunctionName: fullLambdaName})
        .then(function(data) {
          //TODO: start here looking at https://github.com/doapp/JAWS/blob/multi-stage/cli/lib/main.js#L184
        });
  };

  JAWS._validateProjJsonAttrsSet = function(region, stage) {
    if (!JAWS._meta.projectJson.project.regions[region]) {
      throw new JawsError('Region', region, 'not setup in project jaws.json');
    }

    if (!JAWS._meta.projectJson.project.regions[region][stage]) {
      throw new JawsError('Stage', stage, 'for region', region, 'not setup in project jaws.json');
    }

    if (!JAWS._meta.projectJson.project.regions[region][stage].iamRoleArn) {
      throw new JawsError(
          'iamRoleArn not set for stage', stage, 'in region', region, 'not setup in project jaws.json'
      );
    }
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

    deployAllTagged = (!deployAllTagged);

    if (deployAllTagged) {
      lambdasPromise = utils.findAllLambdas(JAWS._meta.projectRootPath);
    } else {
      JAWS.tag();
      lambdasPromise = Promise.resolve([process.cwd()]);
    }

    return lambdasPromise
        .then(function(lambdaJawsPaths) {
          var deployableJawsFiles = _this._getDeployableLambdas(lambdaJawsPaths),
              builderQueue = [];

          deployableJawsFiles.forEach(function(jawsFile) {
            builderQueue.push(_this._bundleLambda(jawsFile, stage));
          });

          return Promise.all(builderQueue);
        })
        .then(function(packagedLambdas) {
          if (!JAWS._meta.projectJson.project.regions) {
            throw new JawsError('Regions not setup in project jaws.json project attr');
          }

          var regions = Object.keys(JAWS._meta.projectJson.project.regions);

          //Deploy the lambdas for given stage, to each region
          regions.forEach(function(region) {
            _this._validateProjJsonAttrsSet(region, stage);

            AWSUtils.configAWS(JAWS._meta.profile, region);

            packagedLambdas.forEach(function(lambdaPackage) {
              //TODO: handle all at once (async of 1 or 10)
              _this._createOrUpdateLambda(
                  lambdaPackage.jawsFilePath,
                  lambdaPackage.zipBuffer,
                  lambdaPackage.fullLambdaName,
                  region,
                  JAWS._meta.projectJson.project.regions[region][stage].iamRoleArn
              );
            });
          });
        });
  };
};
