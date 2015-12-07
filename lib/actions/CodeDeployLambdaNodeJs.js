'use strict';

/**
 * Action: Code Upload: Lambda: Nodejs
 * - Uploads a single Lambda's code to their Serverless region bucket
 * - Don't attach "evt" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently.
 */

const SPlugin    = require('../ServerlessPlugin'),
    SError       = require('../ServerlessError'),
    SUtils       = require('../utils/index'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
    Zip          = require('node-zip'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class CodeDeployLambdaNodejs extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'serverless.core.' + CodeDeployLambdaNodejs.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.S.addAction(this.codeDeployLambdaNodejs.bind(this), {
      handler:     'codeDeployLambdaNodejs',
      description: 'Uploads a Lambda\'s code to S3'
    });

    return BbPromise.resolve();
  }

  /**
   * Deploy Code Lambda Node.Js
   */

  codeDeployLambdaNodejs(evt) {
    let deployer = new Deployer(this.S);
    return deployer.deploy(evt);
  }
}

/**
 * Deployer
 * - Necessary for this action to run concurrently
 */

class Deployer {

  constructor(S) {
    this.S = S;
  }

  deploy(evt) {
    let _this = this;

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };
    _this.S3         = require('../utils/aws/S3')(awsConfig);
    _this.Lambda     = require('../utils/aws/Lambda')(awsConfig);
    _this.AwsMisc    = require('../utils/aws/Misc');

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._compress)
        .then(_this._upload)
        .then(_this._deploy)
        .then(function() {
          return evt;
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {
    return BbPromise.resolve(evt);
  }

  /**
   * Compress
   */

  _compress(evt) {

    let zip = new Zip();

    evt.function.pathsPackaged.forEach(nc => {
      zip.file(nc.fileName, nc.data);
    });

    let zipBuffer = zip.generate({
      type:        'nodebuffer',
      compression: 'DEFLATE',
    });

    if (zipBuffer.length > 52428800) {
      Promise.reject(new SError(
          'Zip file is > the 50MB Lambda queued limit (' + zipBuffer.length + ' bytes)',
          SError.errorCodes.ZIP_TOO_BIG)
      );
    }

    // Set path of compressed package
    evt.function.pathCompressed = path.join(evt.function.pathDist, 'package.zip');

    // Create compressed package
    fs.writeFileSync(
        evt.function.pathCompressed,
        zipBuffer);

    SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Compressed file created - ${evt.function.pathCompressed}`);

    return BbPromise.resolve(evt);
  }

  /**
   * Upload
   * - Upload zip file to S3
   */

  _upload(evt) {

    let _this = this;

    SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Uploading to - ${evt.region.regionBucket}`);

    return _this.S3.sPutLambdaZip(
        evt.region.regionBucket,
        _this.S._projectJson.name,
        evt.stage,
        evt.function.name,
        fs.createReadStream(evt.function.pathCompressed))
        .then(function(s3Key) {

          // Add S3Key and Bucket to Lambda.Function.Properties.Code
          for (let r in evt.function.cloudFormation.lambda) {

            if (evt.function.cloudFormation.lambda[r].Type === 'AWS::Lambda::Function') {
              evt.function.cloudFormation.lambda[r].Properties.Code = {
                S3Bucket: evt.region.regionBucket,
                S3Key: s3Key
              };

              // Save Lambda CF
              _this.cfLambda = evt.function.cloudFormation.lambda[r];
            }
          }

          return BbPromise.resolve(evt);
        });
  }

  /**
   * Deploy
   * - Deploy Lambda from S3 to Lambda
   */

  _deploy(evt) {

    let _this = this,
        lambda,
        lambdaVersion;

    var params = {
      FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function),
      Qualifier:    '$LATEST'
    };

    return _this.Lambda.getFunctionPromised(params)
        .catch(function(e) {
          lambda = null;
        })
        .then(function(data) {
          lambda = data;
        })
        .then(function() {

          // Create or Update Lambda

          if (!lambda) {

            SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Creating Lambda function...`);

            // Create Lambda
            let params = {
              Code: {
                S3Bucket:   evt.region.regionBucket,
                S3Key:      _this.cfLambda.Properties.Code.S3Key
              },
              FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function), /* required */
              Handler:      _this.cfLambda.Properties.Handler, /* required */
              Role:         evt.region.iamRoleArnLambda, /* required */
              Runtime:      _this.cfLambda.Properties.Runtime, /* required */
              Description: 'Serverless Lambda function for project: ' + _this.S._projectJson.name,
              MemorySize:   _this.cfLambda.Properties.MemorySize,
              Publish:      true, // Required by Serverless Framework & recommended by AWS
              Timeout:      _this.cfLambda.Properties.Timeout
            };
            return _this.Lambda.createFunctionPromised(params)
                .then(function(data) {

                  // Save Version
                  lambdaVersion = data.Version;

                  return data;
                });

          } else {

            SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Updating Lambda function...`);

            // Update Lambda Code
            let params = {
              FunctionName:  lambda.Configuration.FunctionName, /* required */
              Publish:       true, // Required by Serverless Framework & recommended by AWS
              S3Bucket:      evt.region.regionBucket,
              S3Key:         _this.cfLambda.Properties.Code.S3Key
            };
            return _this.Lambda.updateFunctionCodePromised(params)
                .then(function(data) {

                  // Save Version
                  lambdaVersion = data.Version;

                  // Check If Function Configuration needs to be updated

                  let updateConfiguration = false;

                  if (data.FunctionName !== data.FunctionName) updateConfiguration = true;
                  if (data.Runtime !== _this.cfLambda.Properties.Runtime) updateConfiguration = true;
                  if (data.Handler !== _this.cfLambda.Properties.Handler) updateConfiguration = true;
                  if (data.MemorySize !== _this.cfLambda.Properties.MemorySize) updateConfiguration = true;
                  if (data.Timeout !== _this.cfLambda.Properties.Timeout) updateConfiguration = true;

                  if (updateConfiguration) {

                    SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Updating Lambda configuration...`);

                    let params = {
                      FunctionName: data.FunctionName, /* required */
                      Description:  'Serverless Lambda function for project: ' + _this.S._projectJson.name,
                      Handler:      _this.cfLambda.Properties.Handler,
                      MemorySize:   _this.cfLambda.Properties.MemorySize,
                      Role:         evt.region.iamRoleArnLambda,
                      Timeout:      _this.cfLambda.Properties.Timeout
                    };
                    return _this.Lambda.updateFunctionConfigurationPromised(params);
                  } else {
                    return data;
                  }
                });
          }
        })
        .then(function(data) {

          // Alias Lambda w/ Stage

          let aliasedLambda = false;

          var params = {
            FunctionName: data.FunctionName, /* required */
            Name: evt.stage.toLowerCase() /* required */
          };

          return _this.Lambda.getAliasPromised(params)
              .then(function() {
                aliasedLambda = true;
              })
              .catch(function(e) {
                aliasedLambda = false;
              })
              .then(function() {

                if (aliasedLambda) {

                  // Update Existing Alias

                  SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Updating Lambda Alias for version - ${lambdaVersion}`);

                  let params = {
                    FunctionName:     data.FunctionName, /* required */
                    FunctionVersion:  lambdaVersion, /* required */
                    Name:             evt.stage, /* required */
                    Description:      'Project: ' + _this.S._projectJson.name + ' Stage: ' + evt.stage
                  };

                  return _this.Lambda.updateAliasPromised(params);

                } else {

                  // Create New Alias

                  SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Creating New Lambda Alias for version - ${lambdaVersion}`);

                  let params = {
                    FunctionName:    data.FunctionName, /* required */
                    FunctionVersion: lambdaVersion,     /* required */
                    Name:            evt.stage,         /* required */
                    Description:     'Project: ' + _this.S._projectJson.name + ' Stage: ' + evt.stage
                  };

                  return _this.Lambda.createAliasPromised(params);
                }
              })
              .then(function(data) {
                // Add Version & Alias information to evt
                evt.function.deployedVersion   = data.FunctionVersion;
                evt.function.deployedAlias     = evt.stage;
                evt.function.deployedAliasArn  = data.AliasArn;
                return evt
              });
        })
  }
}

module.exports = CodeDeployLambdaNodejs;