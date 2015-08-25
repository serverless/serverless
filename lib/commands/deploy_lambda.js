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

  /**
   * Package up nodejs lambda
   *
   * @param tmpDistDir
   * @param fullLambdaName
   * @param jawsFilePath
   * @param excludeFiles
   * @param ignoreFiles
   * @returns {Promise} {jawsFilePath: jawsFilePath,zipBuffer:zippedData}
   * @private
   */
  JAWS._packageNodeJs = function(tmpDistDir, fullLambdaName, jawsFilePath, excludeFiles, ignoreFiles) {
    var baseDir = path.dirname(jawsFilePath),
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
            zip.file('index.js', result.code);

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
   * Create lambda package for deployment
   *
   * @param jawsFilePath
   * @param stage
   * @returns {Promise} {jawsFilePath: jawsFilePath,zipBuffer:zippedData}
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
        return _this._packageNodeJs(tmpDistDir);
        break;
      default:
        return Promise.reject(new JawsError(
            'Unsupported lambda runtime ' + jawsJson.lambda.runtime,
            JawsError.errorCodes.UNKNOWN));
        break;
    }
  };

  JAWS._createOrUpdateLambda = function(jawsFilePath, zipBuffer) {

  };

  /**
   * Deploy lambda at cwd or if deployAll is true does all tag lambdas under back dir
   *
   * @param stage
   * @param {bool} deployAll optional. by default deploys cwd
   * @returns {Promise}
   */
  JAWS.deployLambdas = function(stage, deployAll) {
    var _this = this,
        lambdasPromise;

    if (deployAll) {
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
            builderQueue.push(_this._bundleLambda(jawsFile));
          });

          return Promise.all(builderQueue);
        })
        .then(function(packagedLambdas) {

        });
  };
};
