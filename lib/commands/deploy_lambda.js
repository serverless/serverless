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

  JAWS._packageNodeJs = function(distDir, fullLambdaName, jawsFilePath, excludeFiles) {
    var jawsJson = require(jawsFilePath),
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

    var uglyOptions = {
      mangle: true,
      compress: {},
    };

    //TODO: save the browserfied js to the fs (browserfied.js) so we have audit trail
    //b.bundle()
    //    .pipe()

    //uglify and save as index.js

    //compress and save as zip
  };

  JAWS._bundleLambda = function(jawsFilePath, stage) {
    var _this = this,
        jawsJson = require(jawsFilePath),
        projName = JAWS._meta.projectJson.name,
        fullLambdaName = [stage, projName, jawsJson.lambda.name].join('_-_'),
        distDir = path.join(os.tmpdir(), fullLambdaName + '@' + new Date());

    console.log('Bundling', fullLambdaName, 'in tmp dir', distDir);

    fs.mkdirSync(distDir);

    switch (jawsJson.lambda.runtime) {
      case 'nodejs':
        return _this._packageNodeJs(distDir);
        break;
      default:
        return Promise.reject(new JawsError(
            'Unsupported lambda runtime ' + jawsJson.lambda.runtime,
            JawsError.errorCodes.UNKNOWN));
        break;
    }
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
        .then(function(builtLambdas) {

        });
  };
};
