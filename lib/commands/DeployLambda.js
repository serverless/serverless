'use strict';

/**
 * JAWS Command: deploy lambda <stage> <region>
 * - Deploys project's lambda(s) to the specified stage
 */

let ProjectCmd = require('./ProjectCmd.js'),
    JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    AWS = require('aws-sdk'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils/index'),
    babelify = require('babelify'),
    browserify = require('browserify'),
    UglifyJS = require('uglify-js'),
    wrench = require('wrench'),
    Tag = require('./Tag'),
    extend = require('util')._extend, //OK with @Isaacs https://github.com/joyent/node/pull/4834#issuecomment-13981250
    Zip = require('node-zip');

Promise.promisifyAll(fs);

var Deployer = class Deployer extends ProjectCmd {
  constructor(JAWS, lambdaPaths, stage, region, noExeCf) {
    super(JAWS);
    this._lambdaAwsmPaths = lambdaPaths;
    this._stage = stage;
    this._region = region;
    this._noExeCf = noExeCf;
  }

  /**
   * @returns {Promise} map of lambdaAwsmPaths to {Code:{},lambdaName:""}
   */
  run() {
    let _this = this,
        projName = this._JAWS._meta.projectJson.name,
        awsmLambdas = [];

    return Promise.try(function() {
        })
        .bind(_this)
        .then(function() {
          return _this._lambdaAwsmPaths;
        })
        .each(function(lambdaAwsmPath) {
          let packager = new Packager(
              _this._JAWS,
              _this._stage,
              _this._region,
              lambdaAwsmPath
          );

          return Promise.try(function() {
              })
              .bind(_this)
              .then(function() {
                return packager.run();
              })
              .then(function(packagedLambda) {
                let jawsBucket = _this._JAWS.getJawsBucket(_this._region, _this._stage);
                JawsCLI.log('Lambda Deployer:  Uploading ' + packagedLambda.lambdaName + ` to ${jawsBucket}`);

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
                      awsmLambdas.push({
                        awsmPath: lambdaAwsmPath,
                        Code: {
                          S3Bucket: jawsBucket,
                          S3Key: s3Key,
                        },
                        lambdaName: packagedLambda.lambdaName,
                      });
                    });
              });
        })
        .then(function() {
          //At this point all packages have been created and uploaded to s3
          let lambdaRoleArn = utils
              .getProjRegionConfigForStage(_this._JAWS._meta.projectJson, _this._stage, _this._region).iamRoleArnLambda;
          return [lambdaRoleArn, _this._generateLambdaCf(awsmLambdas, lambdaRoleArn)];
        })
        .spread(function(lambdaRoleArn, existingStack) {
          if (_this._noExeCf) {
            JawsCLI.log(`Lambda Deployer: not executing CloudFormation. Remember to set aaLambdaRoleArn parameter to ${lambdaRoleArn}`);
            return false;
          } else {
            let createOrUpdate,
                cfDeferred;

            utils.jawsDebug(`Deploying with lambda role arn ${lambdaRoleArn}`);

            if (existingStack) {
              cfDeferred = AWSUtils.cfUpdateLambdasStack(_this._JAWS, _this._stage, _this._region, lambdaRoleArn);
              createOrUpdate = 'update';
            } else {
              cfDeferred = AWSUtils.cfCreateLambdasStack(_this._JAWS, _this._stage, _this._region, lambdaRoleArn);
              createOrUpdate = 'create';
            }

            JawsCLI.log('Running CloudFormation lambda deploy...');
            let spinner = JawsCLI.spinner();
            spinner.start();

            return cfDeferred
                .then(function(cfData) {
                  return AWSUtils.monitorCf(cfData, _this._JAWS._meta.profile, _this._region, createOrUpdate);
                })
                .then(function() {
                  spinner.stop(true);
                });
          }
        })
        .then(function() {
              JawsCLI.log('Lambda Deployer:  Done deploying lambdas in ' + _this._region);
            }
        );
  }

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
   * @param taggedLambdaPkgs object {awsmPath: "",lambdaName:"",Code:{}}
   * @param lambdaRoleArn
   * @returns {Promise} true if there was an existing stack, false if not
   * @private
   */
  _generateLambdaCf(taggedLambdaPkgs, lambdaRoleArn) {
    //TODO: docs: if someone manually changes resource or action dir names and does NOT mark the changed awsm.jsons
    //for deploy they will lose a lambda
    let _this = this,
        existingStack = true,
        projName = this._JAWS._meta.projectJson.name;

    return AWSUtils.cfGetLambdasStackTemplate(_this._JAWS._meta.profile, _this._region, _this._stage, projName)
        .error(e => {
          if (e && ['ValidationError', 'ResourceNotFoundException'].indexOf(e.code) == -1) {  //ValidationError if DNE
            console.error(
                'Error trying to fetch existing lambda cf stack for region', _this._region, 'stage', _this._stage, e
            );
            throw new JawsError(e.message, JawsError.errorCodes.UNKNOWN);
          }

          utils.jawsDebug('no exsting lambda stack');
          existingStack = false;
          return false;
        })
        .then(cfTemplateBody => {
          let templatesPath = path.join(__dirname, '..', 'templates'),
              lambdaCf = utils.readAndParseJsonSync(path.join(templatesPath, 'lambdas-cf.json'));

          delete lambdaCf.Resources.lTemplate;
          lambdaCf.Description = projName + " lambdas";
          lambdaCf.Parameters.aaLambdaRoleArn.Default = lambdaRoleArn;

          //Always add lambdas tagged for deployment
          taggedLambdaPkgs.forEach(function(pkg) {
            let lResource = {
                  Type: "AWS::Lambda::Function",
                  Properties: {}
                },
                awsm = utils.readAndParseJsonSync(pkg.awsmPath);

            lResource.Properties = awsm.lambda.cloudFormation;
            lResource.Properties.Code = pkg.Code;
            lResource.Properties.Role = {
              Ref: "aaLambdaRoleArn"
            };

            utils.jawsDebug('adding Resource ' + pkg.lambdaName + ': ');
            utils.jawsDebug(lResource);

            lambdaCf.Resources[pkg.lambdaName] = lResource;
          });

          // If existing lambdas CF template
          if (cfTemplateBody) {
            utils.jawsDebug('existing stack detected');

            // Find all lambdas in project, and copy ones that are in existing lambda-cf
            let existingTemplate = JSON.parse(cfTemplateBody);

            return utils.getAllLambdaNames(_this._JAWS._meta.projectRootPath)
                .then(allLambdaNames => {
                  Object.keys(existingTemplate.Resources).forEach(function(resource) {

                    if (!lambdaCf.Resources[resource] && allLambdaNames.indexOf(resource) != -1) {
                      utils.jawsDebug(`Adding exsiting lambda ${resource}`);
                      lambdaCf.Resources[resource] = existingTemplate.Resources[resource];
                    }
                  });

                  return lambdaCf;
                });
          } else {
            return lambdaCf;
          }
        })
        .then(lambdaCfTemplate => {
          let lambdasCfPath = path.join(
              _this._JAWS._meta.projectRootPath,
              'cloudformation',
              _this._stage,
              _this._region,
              'lambdas-cf.json'
          );

          utils.jawsDebug(`Wrting to ${lambdasCfPath}`);

          return utils.writeFile(lambdasCfPath, JSON.stringify(lambdaCfTemplate, null, 2))
              .then(() => existingStack);
        });
  }
};

var Packager = class Packager extends ProjectCmd {
  constructor(JAWS, stage, region, lambdaPath) {
    super(JAWS);
    this._lambdaPath = lambdaPath;
    this._stage = stage;
    this._region = region;
    this._awsmJson = utils.readAndParseJsonSync(this._lambdaPath);
    this._lambdaName = '';
  }

  /**
   *
   * @returns {Promise} {lambdaName:"", awsmFilePath: "", zipBuffer: compressedCodeBuffer}
   */
  run() {
    let _this = this;

    this._lambdaName = this.createLambdaName();

    return this._createDistFolder()
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
  }

  /**
   * Create a lambda name from the awsm metadata. Uses Handler string because its
   * inherintly unique within the project
   *
   * @returns {string}
   */
  createLambdaName() {
    let _this = this,
        name = utils.generateLambdaName(_this._awsmJson);

    utils.jawsDebug(`computed lambdaName: ${name}`);
    return name;
  }

  /**
   * Create Dist Folder (for an individual lambda)
   *
   * @returns {Promise}
   * @private
   */
  _createDistFolder() {

    let _this = this;

    // Create dist folder
    let d = new Date();
    _this._distDir = path.join(os.tmpdir(), _this._lambdaName + '@' + d.getTime());

    // Status
    JawsCLI.log('Lambda Deployer:  Packaging "' + _this._lambdaName + '"...');
    JawsCLI.log('Lambda Deployer:  Saving in dist dir ' + _this._distDir);

    utils.jawsDebug('copying', _this._JAWS._meta.projectRootPath, 'to', _this._distDir);

    // Copy entire test project to temp folder
    _this._excludePatterns = _this._awsmJson.lambda.package.excludePatterns || [];
    wrench.copyDirSyncRecursive(
        _this._JAWS._meta.projectRootPath,
        _this._distDir,
        {
          exclude: function(name, prefix) {
            if (!_this._excludePatterns.length) {
              return false;
            }

            let relPath = path.join(
                prefix.replace(_this._distDir, ''), name);

            return _this._excludePatterns.some(sRegex => {
              relPath = (relPath.charAt(0) == path.sep) ? relPath.substr(1) : relPath;

              let re = new RegExp(sRegex),
                  matches = re.exec(relPath);

              let willExclude = (matches && matches.length > 0);

              if (willExclude) {
                JawsCLI.log(`Lambda Deployer:  Excluding ${relPath}`);
              }

              return willExclude;
            });
          },
        }
    );

    utils.jawsDebug('Packaging stage & region:', _this._stage, _this._region);

    // Get ENV file from S3
    return _this._JAWS.getEnvFile(_this._region, _this._stage)
        .then(function(s3ObjData) {
          fs.writeFileSync(path.join(_this._distDir, '.env'), s3ObjData.Body);
        });
  }

  /**
   *
   * @returns {Promise} {awsmFilePath: "", zipBuffer: compressedCodeBuffer}
   * @private
   */
  _packageNodeJs() {

    let _this = this,
        deferred = null;

    if (_this._awsmJson.lambda.package
        && _this._awsmJson.lambda.package.optimize
        && _this._awsmJson.lambda.package.optimize.builder) {

      deferred = _this._optimizeNodeJs()
          .then(optimizedCodeBuffer => {

            // Lambda freaks out if code doesnt end in newline
            let ocbWithNewline = optimizedCodeBuffer.concat(new Buffer('\n'));
            let envData = fs.readFileSync(path.join(_this._distDir, '.env'));

            let handlerFileName = _this._awsmJson.lambda.cloudFormation.Handler.split('.')[0],
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
      let compressPaths = _this._generateIncludePaths();
      deferred = _this._compressCode(compressPaths);
    }

    return deferred
        .then(function(compressedCodeBuffer) {
          let zippedFilePath = path.join(_this._distDir, 'package.zip'); // Save for auditing;
          fs.writeFileSync(zippedFilePath, compressedCodeBuffer);

          JawsCLI.log(`Lambda Deployer:  Compressed lambda written to ${zippedFilePath}`);

          return Promise.resolve({awsmFilePath: _this._lambdaPath, zipBuffer: compressedCodeBuffer});
        });
  }

  /**
   *
   * @returns {*}
   * @private
   */
  _optimizeNodeJs() {

    let _this = this;

    if (!_this._awsmJson.lambda.package.optimize
        || !_this._awsmJson.lambda.package.optimize.builder) {
      return Promise.reject(new JawsError('Cant optimize for nodejs. lambda jaws.json does not have optimize.builder set'));
    }

    if (_this._awsmJson.lambda.package.optimize.builder.toLowerCase() == 'browserify') {
      return _this._browserifyBundle();
    } else {
      return Promise.reject(new JawsError(`Unsupported builder ${builder}`));
    }
  }

  /**
   *
   * @returns {bluebird|exports|module.exports}
   * @private
   */
  _browserifyBundle() {

    let _this = this;
    let uglyOptions = {
      mangle: true, // @see http://lisperator.net/uglifyjs/compress
      compress: {},
    };
    let b = browserify({
      basedir: _this._distDir,
      entries: [_this._awsmJson.lambda.cloudFormation.Handler.split('.')[0] + '.js'],
      standalone: 'lambda',
      browserField: false,  // Setup for node app (copy logic of --node in bin/args.js)
      builtins: false,
      commondir: false,
      ignoreMissing: true,  // Do not fail on missing optional dependencies
      detectGlobals: true,  // Default for bare in cli is true, but we don't care if its slower
      insertGloballets: {   // Handle process https://github.com/substack/node-browserify/issues/1277
        //__filename: insertGlobals.lets.__filename,
        //__dirname: insertGlobals.lets.__dirname,
        process: function() {
        },
      },
    });

    if (_this._awsmJson.lambda.package.optimize.babel) {
      b.transform(babelify)
    }

    if (_this._awsmJson.lambda.package.optimize.transform) {
      b.transform(_this._awsmJson.lambda.package.optimize.transform);
    }

    // optimize.exclude
    _this._awsmJson.lambda.package.optimize.exclude.forEach(function(file) {
      b.exclude(file);
    });

    // optimize.ignore
    _this._awsmJson.lambda.package.optimize.ignore.forEach(function(file) {
      b.ignore(file);
    });

    // Perform Bundle
    let bundledFilePath = path.join(_this._distDir, 'bundled.js');   // Save for auditing
    let minifiedFilePath = path.join(_this._distDir, 'minified.js'); // Save for auditing

    return new Promise(function(resolve, reject) {
      b.bundle(function(err, bundledBuf) {
        if (err) {
          console.error('Error running browserify bundle');
          reject(err);
        } else {
          fs.writeFileSync(bundledFilePath, bundledBuf);
          JawsCLI.log(`Lambda Deployer:  Bundled file written to ${bundledFilePath}`);

          if (_this._awsmJson.lambda.package.optimize.exclude) {
            let result = UglifyJS.minify(bundledFilePath, uglyOptions);

            if (!result || !result.code) {
              reject(new JawsError('Problem uglifying code'));
            }

            fs.writeFileSync(minifiedFilePath, result.code);

            JawsCLI.log(`Lambda Deployer:  Minified file written to ${minifiedFilePath}`);
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
   * @returns {Array}
   * @private
   */
  _generateIncludePaths() {
    let _this = this,
        compressPaths = [],
        ignore = ['.DS_Store'],
        stats,
        fullPath;

    _this._awsmJson.lambda.package.optimize.includePaths.forEach(p => {
      try {
        fullPath = path.resolve(path.join(_this._distDir, p));
        stats = fs.lstatSync(fullPath);
      } catch (e) {
        console.error('Cant find includePath ', p, e);
        throw e;
      }

      if (stats.isFile()) {
        compressPaths.push({fileName: p, data: fullPath});
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
                let pathInZip = path.join('node_modules', dirname, file);
                utils.jawsDebug('Adding', pathInZip);
                compressPaths.push({fileName: pathInZip, data: fs.readFileSync(filePath)});
              }
            });
      }
    });

    return compressPaths;
  }

  /**
   *
   * @param compressPaths
   * @returns {Promise}
   * @private
   */
  _compressCode(compressPaths) {
    let zip = new Zip();

    compressPaths.forEach(nc => {
      zip.file(nc.fileName, nc.data);
    });

    let zippedData = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    if (zippedData.length > 52428800) {
      Promise.reject(new JawsError(
          'Zip file is > the 50MB Lambda deploy limit (' + zippedData.length + ' bytes)',
          JawsError.errorCodes.ZIP_TOO_BIG)
      );
    }

    return Promise.resolve(zippedData);
  }
};

var CMD = class DeployLambda extends ProjectCmd {
  constructor(JAWS, stage, region, allTagged, noExeCf) {
    super(JAWS);
    this._stage = stage;
    this._region = region;
    this._allTagged = allTagged;
    this._lambdaAwsmPaths = [];
    this._noExeCf = (noExeCf === true);
  }

  /**
   *
   * @returns {Promise} map of lambdaAwsmPaths to {Code:{},lambdaName:""}
   */
  run() {
    let _this = this;

    return this._JAWS.validateProject()
        .bind(_this)
        .then(_this._promptStage)
        .then(_this._setRegions)
        .then(_this._validate)
        .then(_this._getTaggedLambdaPaths)
        .then(function() {
          utils.jawsDebug('Deploying to stage:', _this._stage);
          return _this._regions;
        })
        .each(function(region) {
          let d = new Deployer(_this._JAWS, _this._lambdaAwsmPaths, _this._stage, region.region, _this._noExeCf);
          return d.run();
        }).then(function(lambdaAwsmPkgs) {
          JawsCLI.log('Lambda Deployer:  Successfully deployed lambdas to the requested regions!');
          return lambdaAwsmPkgs;
        });
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _promptStage() {
    let _this = this,
        stages = [];

    // If stage exists, skip
    if (!this._stage) {
      stages = Object.keys(_this._JAWS._meta.projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        this._stage = stages[0];
      }
    }

    if (this._stage) { //User specified stage or only one stage
      return Promise.resolve();
    }

    // Create Choices
    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key: '',
        value: stages[i],
        label: stages[i],
      });
    }

    return JawsCLI.select('Lambda Deployer:  Choose a stage: ', choices, false)
        .then(results => {
          _this._stage = results[0].value;
        });
  }

  /**
   * this._stage must be set before calling this method
   * @returns {Promise}
   * @private
   */
  _setRegions() {
    let stage = this._stage,
        region = this._region,//may not be set, default is to deploy to all regions in stage
        projJson = this._JAWS._meta.projectJson;

    if (region) { //user specified specific region to deploy to
      this._regions = [utils.getProjRegionConfigForStage(projJson, stage, region)];
    } else {
      this._regions = projJson.stages[stage];
    }

    utils.jawsDebug('Deploying to regions:');
    utils.jawsDebug(this._regions);
    return Promise.resolve();
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _validate() {

    let _this = this;

    // Validate: Check stage exists within project
    if (!_this._JAWS._meta.projectJson.stages[_this._stage]) {
      return Promise.reject(new JawsError(`Invalid stage ${stage}`));
    }

    return Promise.resolve();
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _getTaggedLambdaPaths() {

    let _this = this;

    if (this._allTagged) {
      let CMDtag = new Tag(_this._JAWS, 'lambda');
      return CMDtag.listAll()
          .then(function(lambdaAwsmPaths) {
            if (!lambdaAwsmPaths.length) {
              throw new JawsError('No tagged lambdas found');
            }

            _this._lambdaAwsmPaths = lambdaAwsmPaths;
          });
    } else {
      return Tag.tag('lambda')
          .then(function(lambdaPath) {

            if (!lambdaPath) {
              throw new JawsError('No tagged lambdas found');
            }

            _this._lambdaAwsmPaths = [lambdaPath];
          });
    }
  }
};

/**************************************
 * EXPORTS
 **************************************/

/**
 *
 * @param JAWS
 * @param stage
 * @param {String} region - Defaults to all regions
 * @param allTagged
 * @param dryRun don't execute lambda cf, just generate
 * @returns {Promise}
 */
module.exports.run = function(JAWS, stage, region, allTagged, dryRun) {
  let command = new CMD(JAWS, stage, region, allTagged, dryRun);
  return command.run();
};


exports.DeployLambda = CMD;
module.exports.Deployer = Deployer;
module.exports.Packager = Packager;
