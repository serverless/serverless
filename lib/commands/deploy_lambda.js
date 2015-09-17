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
    extend = require('util')._extend, //OK with @Isaacs https://github.com/joyent/node/pull/4834#issuecomment-13981250
    Zip = require('node-zip');

Promise.promisifyAll(fs);

/**
 * Run
 * @param JAWS
 * @param stage
 * @param {String} region - Defaults to all regions
 * @param allTagged
 * @param dryRun don't execute lambda cf, just generate
 * @returns {Promise}
 */

module.exports.run = function(JAWS, stage, region, allTagged, dryRun) {
  var command = new CMD(JAWS, stage, region, allTagged, dryRun);
  return command.run();
};

/**
 * Command Class
 * @param JAWS
 * @param stage optional. If only one in proj will use it
 * @param {String} region - Defaults to all regions
 * @param allTagged
 * @param noExeCf don't execute lambda cf, just generate
 * @constructor
 */

function CMD(JAWS, stage, region, allTagged, noExeCf) {
  this._JAWS = JAWS;
  this._stage = stage;
  this._region = region;
  this._allTagged = allTagged;
  this._lambdaAwsmPaths = [];
  this._noExeCf = (noExeCf === true);
}

/**
 * CMD: Run
 *
 * @returns {Promise} map of lambdaAwsmPaths to {Code:{},lambdaName:""}
 */

CMD.prototype.run = Promise.method(function() {
  var _this = this;

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(_this._setRegions)
      .then(_this._validate)
      .then(_this._getTaggedLambdaPaths)
      .then(function() {
        utils.logIfVerbose("Deploying to stage:");
        utils.logIfVerbose(_this._stage);
        return _this._regions;
      })
      .each(function(region) {
        var deployer = new Deployer(_this._JAWS, _this._lambdaAwsmPaths, _this._stage, region.region, _this._noExeCf);
        return deployer.deploy();
      }).then(function(lambdaAwsmPkgs) {
        JawsCLI.log('Lambda Deployer:  Successfully deployed lambdas to the requested regions!');
        return lambdaAwsmPkgs;
      });
});

/**
 * CMD: Prompt: Stage
 */

CMD.prototype._promptStage = Promise.method(function() {

  var _this = this;

  // If stage exists, skip
  if (!_this._stage) {
    var stages = Object.keys(_this._JAWS._meta.projectJson.stages);

    // If project only has 1 stage, skip prompt
    if (stages.length === 1) {
      _this._stage = stages[0];
    }
  }

  if (_this._stage) { //User specified stage or only one stage
    return Promise.resolve();
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
 * this._stage must be set before calling this method
 */
CMD.prototype._setRegions = Promise.method(function() {
  var stage = this._stage,
      region = this._region,//may not be set, default is to deploy to all regions in stage
      projJson = this._JAWS._meta.projectJson;

  if (region) { //user specified specific region to deploy to
    this._regions = [utils.getProjRegionConfigForStage(projJson, stage, region)];
  } else {
    this._regions = projJson.stages[stage];
  }

  utils.logIfVerbose('Deploying to regions:');
  utils.logIfVerbose(this._regions);
});

/**
 * CMD: Validate
 */

CMD.prototype._validate = Promise.method(function() {

  var _this = this;

  // Validate: Check stage exists within project
  if (!_this._JAWS._meta.projectJson.stages[_this._stage]) {
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
        .then(function(lambdaAwsmPaths) {

          if (!lambdaAwsmPaths.length) {
            throw new JawsError('No tagged lambdas found');
          }

          _this._lambdaAwsmPaths = lambdaAwsmPaths;
        });
  } else {
    return CMDtag.tag('lambda')
        .then(function(lambdaPath) {

          if (!lambdaPath) {
            throw new JawsError('No tagged lambdas found');
          }

          _this._lambdaAwsmPaths = [lambdaPath];
        });
  }
});

/**
 * Deployer Class
 */

function Deployer(JAWS, lambdaPaths, stage, region, noExeCf) {
  this._JAWS = JAWS;
  this._lambdaAwsmPaths = lambdaPaths;
  this._stage = stage;
  this._region = region;
  this._noExeCf = noExeCf;
}

/**
 * Deploy lambdas
 *
 * @returns {Promise} map of lambdaAwsmPaths to {Code:{},lambdaName:""}
 */
Deployer.prototype.deploy = Promise.method(function() {

  var _this = this,
      projName = _this._JAWS._meta.projectJson.name,
      awsmLambdas = {};

  return Promise.try(function() {
      })
      .bind(_this)
      .then(function() {
        return _this._lambdaAwsmPaths;
      })
      .each(function(lambdaAwsmPath) {
        var packager = new Packager(
            _this._JAWS,
            _this._stage,
            _this._region,
            lambdaAwsmPath
        );

        return Promise.try(function() {
            })
            .bind(_this)
            .then(function() {
              return packager.package();
            })
            .then(function(packagedLambda) {
              var jawsBucket = _this._JAWS._meta.projectJson.jawsBuckets[_this._region];
              JawsCLI.log("Lambda Deployer:  Uploading " + packagedLambda.lambdaName);

              return AWSUtils.putLambdaZip(
                      _this._JAWS._meta.profile,
                      _this._region,
                      jawsBucket,
                      projName,
                      _this._stage,
                      packagedLambda.lambdaName,
                      packagedLambda.zipBuffer
                  )
                  .then(function(s3Key) {
                    awsmLambdas[lambdaAwsmPath] = {
                      Code: {
                        S3Bucket: jawsBucket,
                        S3Key: s3Key,
                      },
                      lambdaName: packagedLambda.lambdaName,
                    };
                  });
            });
      })
      .then(function() {
        //At this point all packages have been created and uploaded to s3
        var lambdaRoleArn = utils
            .getProjRegionConfigForStage(_this._JAWS._meta.projectJson, _this._stage, _this._region).iamRoleArnLambda;
        return [lambdaRoleArn, _this._generateLambdaCf(awsmLambdas, lambdaRoleArn)];
      })
      .spread(function(lambdaRoleArn, existingStack) {
        if (_this._noExeCf) {
          JawsCLI.log('Lambda Deployer: not executing CloudFormation. Remember to set aaLambdaRoleArn parameter to ' + lambdaRoleArn);
          return false;
        } else {
          var createOrUpdate,
              cfDeferred;

          utils.logIfVerbose('Using lambda role arn ' + lambdaRoleArn);

          if (existingStack) {
            cfDeferred = AWSUtils.cfUpdateLambdasStack(_this._JAWS, _this._stage, _this._region, lambdaRoleArn);
            createOrUpdate = 'update';
          } else {
            cfDeferred = AWSUtils.cfCreateLambdasStack(_this._JAWS, _this._stage, _this._region, lambdaRoleArn);
            createOrUpdate = 'create';
          }

          var spinner = JawsCLI.spinner('Running CloudFormation lambda deploy...');
          spinner.start();

          return cfDeferred
              .then(function(cfData) {
                return AWSUtils.monitorCf(cfData, _this._JAWS._meta.profile, _this._region, createOrUpdate);
              })
              .then(function() {
                spinner.stop(true);
              })
        }
      })
      .then(function() {
        JawsCLI.log('Lambda Deployer:  Done deploying lambdas in ' + _this._region);
      });
});

/**
 * Generate lambda-cf.json file
 *
 * Always put in entries for lambdas marked as deploy
 *
 * If no existing lambda CF, just generate ones that are marked as deploy
 *
 * If existing lambda CF, find all awsm.json's in current project, and put in ones that are already in
 * existing lambda-cf.json. Making sure to use the existing CF obj for the lambda to not trigger an update
 *
 * @param taggedLambdaPkgs is {"/blah/project/back/lambdas/users/edit/awsm.json":{lambdaName:"",Code:{}}}
 * @param lambdaRoleArn
 * @returns {Promise} true if there was an existing stack, false if not
 * @private
 */
Deployer.prototype._generateLambdaCf = function(taggedLambdaPkgs, lambdaRoleArn) {
  //TODO: docs: if someone manually changes resource or action dir names and does NOT mark the changed awsm.jsons
  //for deploy they will lose a lambda
  var _this = this,
      existingStack = true,
      projName = _this._JAWS._meta.projectJson.name;

  return AWSUtils.cfGetLambdasStackTemplate(_this._JAWS._meta.profile, _this._region, _this._stage, projName)
      .error(function(e) {
        if (e && ['ValidationError', 'ResourceNotFoundException'].indexOf(e.code) == -1) {  //ValidationError if DNE
          console.error(
              'Error trying to fetch existing lambda cf stack for region', _this._region, 'stage', _this._stage, e
          );
          throw new JawsError(e.message, JawsError.errorCodes.UNKNOWN);
        }

        utils.logIfVerbose('no exsting lambda stack');
        existingStack = false;
        return false;
      })
      .then(function(cfTemplateBody) {
        var templatesPath = path.join(__dirname, '..', 'templates'),
            lambdaCfTemplate = utils.readAndParseJsonSync(path.join(templatesPath, 'lambdas-cf.json'));

        var lambdaResourceTemplate = extend({}, lambdaCfTemplate.Resources.lTemplate);
        delete lambdaCfTemplate.Resources.lTemplate;
        lambdaCfTemplate.Description = projName + " lambdas";
        lambdaCfTemplate.Parameters.aaLambdaRoleArn.Default = lambdaRoleArn;

        utils.logIfVerbose('base lambda cf resource template:');
        utils.logIfVerbose(lambdaResourceTemplate);

        //Always add lambdas tagged for deployment
        Object.keys(taggedLambdaPkgs).forEach(function(awsmPath) {
          var pkg = taggedLambdaPkgs[awsmPath],
              lResource = extend({}, lambdaResourceTemplate),
              awsm = utils.readAndParseJsonSync(awsmPath),
              props = extend(lResource.Properties, awsm.lambda.cloudFormation);

          lResource.Properties.Code = pkg.Code;

          utils.logIfVerbose('adding Resource ' + pkg.lambdaName + ': ');
          utils.logIfVerbose(lResource);

          lambdaCfTemplate.Resources[pkg.lambdaName] = lResource;//extend(lResource, awsm.cloudFormation);
        });

        // If existing lambdas CF template
        if (cfTemplateBody) {
          utils.logIfVerbose('existing stack detected');

          // Find all lambdas in project, and copy ones that are in existing lambda-cf
          var existingTemplate = JSON.parse(cfTemplateBody);

          return utils.getAllLambdaNames(_this._JAWS._meta.projectRootPath)
              .then(function(allLambdaNames) {
                Object.keys(existingTemplate.Resources).forEach(function(resource) {

                  if (!lambdaCfTemplate.Resources[resource] && allLambdaNames.indexOf(resource) != -1) {
                    utils.logIfVerbose('Adding exsiting lambda ' + resource);
                    lambdaCfTemplate.Resources[resource] = existingTemplate.Resources[resource];
                  }
                });

                return lambdaCfTemplate;
              });
        } else {
          return lambdaCfTemplate;
        }
      })
      .then(function(lambdaCfTemplate) {
        var lambdasCfPath = path.join(
            _this._JAWS._meta.projectRootPath,
            'cloudformation',
            _this._stage,
            _this._region,
            'lambdas-cf.json'
        );

        utils.logIfVerbose('Wrting to ' + lambdasCfPath);

        return utils.writeFile(lambdasCfPath, JSON.stringify(lambdaCfTemplate, null, 2))
            .then(function() {
              return existingStack;
            });
      });
};

/**
 * Packager Class
 */

function Packager(JAWS, stage, region, lambdaPath) {
  this._JAWS = JAWS;
  this._lambdaPath = lambdaPath;
  this._stage = stage;
  this._region = region;
  this._awsmJson = utils.readAndParseJsonSync(this._lambdaPath);
  this._lambdaName = '';
}

/**
 * Create a lambda name from the awsm metadata. Uses Handler string because its
 * inherintly unique within the project
 *
 * @returns {string}
 */
Packager.prototype.createLambdaName = function() {
  var _this = this,
      name = utils.generateLambdaName(_this._awsmJson);

  utils.logIfVerbose('computed lambdaName: ' + name);
  return name;
};

/**
 * Packager: Package
 *
 * @returns {Promise} {lambdaName:"", awsmFilePath: "", zipBuffer: compressedCodeBuffer}
 */

Packager.prototype.package = Promise.method(function() {

  var _this = this;

  _this._lambdaName = _this.createLambdaName();

  return _this._createDistFolder()
      .then(function() {

        // Package by runtime
        switch (_this._awsmJson.lambda.cloudFormation.Runtime) {
          case 'nodejs':
            return _this._packageNodeJs()
                .then(function(packageData) {
                  packageData.lambdaName = _this._lambdaName;
                  return packageData;
                });
            break;
          default:
            return Promise.reject(new JawsError('Unsupported lambda runtime ' + _this._awsmJson.lambda.cloudFormation.Runtime));
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
  _this._excludePatterns = _this._awsmJson.lambda.package.excludePatterns || [];
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

  utils.logIfVerbose('Packaging stage & region:');
  utils.logIfVerbose(_this._stage);
  utils.logIfVerbose(_this._region);

  // Get ENV file from S3
  return _this._JAWS.getEnvFile(_this._region, _this._stage)
      .then(function(s3ObjData) {
        var targetBackDir = path.join(_this._distDir, 'back');
        fs.writeFileSync(path.join(targetBackDir, '.env'), s3ObjData.Body);
      });
});

/**
 * Packager: Package NodeJs
 *
 * @returns {Promise} {awsmFilePath: "", zipBuffer: compressedCodeBuffer}
 */

Packager.prototype._packageNodeJs = Promise.method(function() {

  var _this = this,
      deferred = null;

  if (_this._awsmJson.lambda.package
      && _this._awsmJson.lambda.package.optimize
      && _this._awsmJson.lambda.package.optimize.builder) {

    deferred = _this._optimizeNodeJs()
        .then(function(optimizedCodeBuffer) {

          // Lambda freaks out if code doesnt end in newline
          var ocbWithNewline = optimizedCodeBuffer.concat(new Buffer('\n'));
          var envData = fs.readFileSync(path.join(_this._distDir, 'back', '.env'));

          var handlerFileName = _this._awsmJson.lambda.cloudFormation.Handler.split('.')[0],
              compressPaths = [

                // handlerFileName is the full path lambda file including dir rel to back
                {fileName: handlerFileName + '.js', data: ocbWithNewline},
                {fileName: '.env', data: envData},
              ];

          if (_this._awsmJson.lambda.package.optimize.includePaths.length) {
            compressPaths = compressPaths.concat(_this._generateIncludePaths());
          }

          return _this._compressCode(compressPaths);
        });
  } else {

    // User chose not to optimize, zip up whatever is in back
    _this._awsmJson.lambda.package.optimize.includePaths = ['.'];
    var compressPaths = _this._generateIncludePaths();
    deferred = _this._compressCode(compressPaths);
  }

  return deferred
      .then(function(compressedCodeBuffer) {
        var zippedFilePath = path.join(_this._distDir, 'package.zip'); // Save for auditing;
        fs.writeFileSync(zippedFilePath, compressedCodeBuffer);

        JawsCLI.log('Lambda Deployer:  Compressed lambda written to ' + zippedFilePath);

        return Promise.resolve({awsmFilePath: _this._lambdaPath, zipBuffer: compressedCodeBuffer});
      });
});

/**
 * Packager: Optimize NodeJs
 */

Packager.prototype._optimizeNodeJs = Promise.method(function() {

  var _this = this;

  if (!_this._awsmJson.lambda.package.optimize
      || !_this._awsmJson.lambda.package.optimize.builder) {
    throw new JawsError('Cant optimize for nodejs. lambda jaws.json does not have optimize.builder set');
  }

  if (_this._awsmJson.lambda.package.optimize.builder.toLowerCase() == 'browserify') {
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
    entries: [_this._awsmJson.lambda.cloudFormation.Handler.split('.')[0] + '.js'],
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
  _this._awsmJson.lambda.package.optimize.exclude.forEach(function(file) {
    b.exclude(file);
  });

  // optimize.ignore
  _this._awsmJson.lambda.package.optimize.ignore.forEach(function(file) {
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

        if (_this._awsmJson.lambda.package.optimize.exclude) {
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

  _this._awsmJson.lambda.package.optimize.includePaths.forEach(function(p) {
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
