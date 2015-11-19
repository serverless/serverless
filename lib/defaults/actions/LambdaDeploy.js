'use strict';

/**
 * Action: DeployLambda
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      BbPromise  = require('bluebird'),
      path       = require('path'),
      os         = require('os'),
      AWS        = require('aws-sdk'),
      AWSUtils   = require('../../utils/aws'),
      JawsUtils  = require('../../utils/index'),
      babelify   = require('babelify'),
      browserify = require('browserify'),
      UglifyJS   = require('uglify-js'),
      wrench     = require('wrench'),
      Zip        = require('node-zip');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class Deployer {
  constructor(JAWS, lambdaPaths, stage, region, noExeCf) {
    this._JAWS            = JAWS;
    this._lambdaAwsmPaths = lambdaPaths;
    this._stage           = stage;
    this._region          = region;
    this._noExeCf         = noExeCf;
  }

  /**
   * @returns {Promise} map of lambdaAwsmPaths to {Code:{},lambdaName:""}
   */
  run() {
    let _this               = this,
        projName            = this._JAWS._projectJson.name,
        awsmLambdasToDeploy = [];

    return BbPromise.try(function() {
      })
      .bind(_this)
      .then(function() {
        return _this._lambdaAwsmPaths;
      })
      .each(function(lambdaAwsmPath) {
        return BbPromise.try(function() {
          })
          .bind(_this)
          .then(function() {
            let packager = new Packager(
              _this._JAWS,
              _this._stage,
              _this._region,
              lambdaAwsmPath
            );
            return packager.run();
          })
          .then(function(packagedLambda) {
            let jawsBucket = _this._JAWS.getProjectBucket(_this._region, _this._stage),
                lambdaName = JawsUtils.getLambdaName(JawsUtils.readAndParseJsonSync(lambdaAwsmPath));
            JawsCLI.log(`Lambda Deployer: Uploading ${lambdaName} to ${jawsBucket}`);

            return AWSUtils.putLambdaZip(
              _this._JAWS._awsProfile,
              _this._region,
              jawsBucket,
              projName,
              _this._stage,
              lambdaName,
              fs.createReadStream(packagedLambda.zipFilePath)
              )
              .then(function(s3Key) {
                awsmLambdasToDeploy.push({
                  awsmPath:   lambdaAwsmPath,
                  Code:       {
                    S3Bucket: jawsBucket,
                    S3Key:    s3Key,
                  },
                  lambdaName: lambdaName,
                });
              });
          });
      })
      .then(function() {
        //At this point all packages have been created and uploaded to s3
        let rcfs          = JawsUtils.getProjRegionConfigForStage(_this._JAWS._projectJson, _this._stage, _this._region),
            lambdaRoleArn = rcfs.iamRoleArnLambda;

        return [lambdaRoleArn, _this._generateLambdaCf(awsmLambdasToDeploy, lambdaRoleArn)];
      })
      .spread(function(lambdaRoleArn, existingStack) {
        if (_this._noExeCf) {
          JawsCLI.log(`Lambda Deployer: not executing CloudFormation. Remember to set aaLambdaRoleArn parameter to ${lambdaRoleArn}`);
          return false;
        } else {
          let createOrUpdate,
              cfDeferred;

          JawsUtils.jawsDebug(`Deploying with lambda role arn ${lambdaRoleArn}`);

          if (existingStack) {
            cfDeferred     = AWSUtils.cfUpdateLambdasStack(_this._JAWS, _this._stage, _this._region, lambdaRoleArn);
            createOrUpdate = 'update';
          } else {
            cfDeferred     = AWSUtils.cfCreateLambdasStack(_this._JAWS, _this._stage, _this._region, lambdaRoleArn);
            createOrUpdate = 'create';
          }

          JawsCLI.log('Running CloudFormation lambda queued...');
          let spinner = JawsCLI.spinner();
          spinner.start();

          return cfDeferred
            .then(function(cfData) {
              return AWSUtils.monitorCf(cfData, _this._JAWS._awsProfile, _this._region, createOrUpdate);
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

  ///**
  // * Generate lambda-cf.json file
  // *
  // * Always put in entries for lambdas marked as queued
  // *
  // * If no existing lambda CF, just generate entries for lambdas intended for deployment
  // *
  // * If existing lambda CF, find all awsm.json's in current project, and put in ones that are already in
  // * existing lambda-cf.json. Making sure to use the existing CF obj for the lambda to not trigger an update
  // *
  // * @param awsmLambdasToDeploy object {awsmPath: "",lambdaName:"",Code:{}}
  // * @param lambdaRoleArn
  // * @returns {Promise} true if there was an existing stack, false if not
  // * @private
  // */
  //_generateLambdaCf(awsmLambdasToDeploy, lambdaRoleArn) {
  //  let _this         = this,
  //      existingStack = true,
  //      projName      = this._JAWS._projectJson.name;
  //
  //  return AWSUtils.cfGetLambdasStackTemplate(_this._JAWS._awsProfile, _this._region, _this._stage, projName)
  //    .error(e => {
  //      if (e && ['ValidationError', 'ResourceNotFoundException'].indexOf(e.code) == -1) {  //ValidationError if DNE
  //        console.error(
  //          'Error trying to fetch existing lambda cf stack for region', _this._region, 'stage', _this._stage, e
  //        );
  //        throw new JawsError(e.message, JawsError.errorCodes.UNKNOWN);
  //      }
  //
  //      JawsUtils.jawsDebug('no exsting lambda stack');
  //      existingStack = false;
  //      return false;
  //    })
  //    .then(cfTemplateBody => {
  //      let templatesPath = path.join(__dirname, '..', '..', 'templates'),
  //          lambdaCf      = JawsUtils.readAndParseJsonSync(path.join(templatesPath, 'lambdas-cf.json'));
  //
  //      delete lambdaCf.Resources.lTemplate;
  //
  //      lambdaCf.Description                        = projName + ' lambdas';
  //      lambdaCf.Parameters.aaLambdaRoleArn.Default = lambdaRoleArn;
  //
  //      //Always add lambdas tagged for deployment
  //      awsmLambdasToDeploy.forEach(pkg => {
  //        let lambdaAwsmJson = JawsUtils.readAndParseJsonSync(pkg.awsmPath),
  //            lambdaName     = pkg.lambdaName;
  //
  //        Object.keys(lambdaAwsmJson.cloudFormation.lambda).forEach(cfEleIdx => {
  //          let cfEle = lambdaAwsmJson.cloudFormation.lambda[cfEleIdx];
  //
  //          //If its not a lambda CF resource, prefix it with the lambda name to prevent collisions
  //          let resourceIdx = (cfEle.Type == 'AWS::Lambda::Function') ? lambdaName : lambdaName + '-' + cfEleIdx;
  //
  //          cfEle.Properties.Code           = pkg.Code;
  //          lambdaCf.Resources[resourceIdx] = cfEle;
  //
  //          JawsUtils.jawsDebug(`adding Resource ${resourceIdx}`, cfEle);
  //        });
  //      });
  //
  //      // If existing lambdas CF template
  //      if (cfTemplateBody) {
  //        JawsUtils.jawsDebug('existing stack detected');
  //
  //        // Find all lambdas in project, and copy ones that are in existing lambda-cf
  //        let existingTemplate = JSON.parse(cfTemplateBody);
  //
  //        return JawsUtils.getAllLambdaNames(_this._JAWS._projectRootPath)
  //          .then(allLambdaNames => {
  //            Object.keys(existingTemplate.Resources).forEach(resource => {
  //
  //              if (!lambdaCf.Resources[resource] && allLambdaNames.indexOf(resource) != -1) {
  //                JawsUtils.jawsDebug(`Adding exsiting lambda ${resource}`);
  //                lambdaCf.Resources[resource] = existingTemplate.Resources[resource];
  //              }
  //            });
  //
  //            return lambdaCf;
  //          });
  //      } else {
  //        return lambdaCf;
  //      }
  //    })
  //    .then(lambdaCfTemplate => {
  //      let lambdasCfPath = path.join(
  //        _this._JAWS._projectRootPath,
  //        'cloudformation',
  //        'lambdas-cf.json'
  //      );
  //
  //      JawsUtils.jawsDebug(`Wrting to ${lambdasCfPath}`);
  //
  //      return JawsUtils.writeFile(lambdasCfPath, JSON.stringify(lambdaCfTemplate, null, 2))
  //        .then(() => existingStack);
  //    });
  //}
}



class DeployLambda extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
    this._stage                   = null;
    this._region                  = null;
    this._noExeCf                 = false;
    this._lambdaAwsmPathsToDeploy = [];
    this._deployToRegions         = [];
    this._deployedLambdasByRegion = [];
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */

  static getName() {
    return 'jaws.core.' + DeployLambda.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.lambdasDeploy.bind(this), {
      handler:       'lambdaDeploy',
      description:   `Deploy lambda at CWD, lambdas at specified paths, or ALL lambdas
usage: jaws lambda deploy [options]... [paths|ALL]...

ex:
  jaws lambda deploy ./aws_modules/greetings/hello
  jaws lambda deploy ALL`,
      context:       'lambda',
      contextAction: 'queued',
      options:       [
        {
          option:      'stage',
          shortcut:    's',
          description: 'Optional if only one stage is defined in project',
        }, {
          option:      'region',
          shortcut:    'r',
          description: 'Optional. Default is to queued to all regions defined in stage',
        }, {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Don\'t execute CloudFormation, just generate it',
        },
      ],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param stage Optional if only one stage is defined in project
   * @param region Optional. Default is to queued to all regions defined in stage
   * @param noExeCf
   * @param lambdaPaths [] optional abs or rel (to cwd) paths to lambda dirs. If ommitted deploys lambda @ cwd
   * @returns {Promise} map of region to map of lambdaAwsmPaths to {Code:{},lambdaName:""}
   */

  lambdasDeploy(stage, region, noExeCf) {
    let _this       = this,
        lambdaPaths = Array.prototype.slice.call(arguments, 3);

    JawsUtils.jawsDebug('Got lambda paths', lambdaPaths);

    this._stage   = stage;
    this._region  = region; //may not be set
    this._noExeCf = (noExeCf == true || noExeCf == 'true');

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._promptStage)
      .then(_this._computeDeployToRegions)
      .then(_this._validate)
      .then(() => {
        JawsUtils.jawsDebug('Deploying to stage:', _this._stage);
        return _this._setLambdaAwsmPaths(lambdaPaths);
      })
      .then(() => {
        if (!this._lambdaAwsmPathsToDeploy || this._lambdaAwsmPathsToDeploy.length == 0) {
          throw new JawsError(`Could not find lambdas to deploy`, JawsError.errorCodes.UNKNOWN);
        }

        return _this._deployToRegions;
      })
      .each(region => {
        let d = new Deployer(_this.Jaws, _this._lambdaAwsmPathsToDeploy, _this._stage, region, _this._noExeCf);
        return d.run()
          .then(lambdaMetaData => {
            this._deployedLambdasByRegion[region] = lambdaMetaData;
          });
      })
      .then(() => {
        JawsCLI.log('Lambda Deployer:  Successfully deployed lambdas to the requested regions!');
        return _this._deployedLambdasByRegion;
      });
  }

}

module.exports          = DeployLambda;
module.exports.Deployer = Deployer;
module.exports.Packager = Packager;
