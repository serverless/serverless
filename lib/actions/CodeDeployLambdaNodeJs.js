'use strict';

/**
 * Action: Code Upload: Lambda: Nodejs
 * - Uploads a single Lambda's code to their Serverless region bucket
 * - Don't attach "evt" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently.
 */

module.exports = function(SPlugin, serverlessPath) {
  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    BbPromise    = require('bluebird'),
    Zip          = require('node-zip'),
    fs           = require('fs'),
    os           = require('os');

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class CodeDeployLambdaNodejs extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + CodeDeployLambdaNodejs.name;
    }

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

            // Store S3 Data
            evt.function.s3Bucket = evt.region.regionBucket;
            evt.function.s3Key    = s3Key;

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
                  S3Bucket:   evt.function.s3Bucket,
                  S3Key:      evt.function.s3Key
                },
                FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function), /* required */
                Handler:      evt.function.handler, /* required */
                Role:         evt.region.iamRoleArnLambda, /* required */
                Runtime:      evt.function.module.runtime, /* required */
                Description: 'Serverless Lambda function for project: ' + _this.S._projectJson.name,
                MemorySize:   evt.function.memorySize,
                Publish:      true, // Required by Serverless Framework & recommended by AWS
                Timeout:      evt.function.timeout
              };
              return _this.Lambda.createFunctionPromised(params)
                  .then(function(data) {

                    // Save Version
                    lambdaVersion = data.Version;

                    return data;
                  })
                  .catch(function(e){
                    console.log(e)
                  })

            } else {

              SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Updating Lambda configuration...`);

              let params = {
                FunctionName: lambda.Configuration.FunctionName, /* required */
                Description:  'Serverless Lambda function for project: ' + _this.S._projectJson.name,
                Handler:      evt.function.handler,
                MemorySize:   evt.function.memorySize,
                Role:         evt.region.iamRoleArnLambda,
                Timeout:      evt.function.timeout
              };

              return _this.Lambda.updateFunctionConfigurationPromised(params)
                .then(function(){
                  SUtils.sDebug(`"${evt.stage} - ${evt.region.region} - ${evt.function.name}": Updating Lambda function...`);

                  // Update Lambda Code
                  let params = {
                    FunctionName:  lambda.Configuration.FunctionName, /* required */
                    Publish:       true, // Required by Serverless Framework & recommended by AWS
                    S3Bucket:      evt.region.regionBucket,
                    S3Key:         evt.function.s3Key,
                  };
                  return _this.Lambda.updateFunctionCodePromised(params)
                      .then(function(data) {

                        // Save Version
                        lambdaVersion = data.Version;

                        return( data );
                      });
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

  return( CodeDeployLambdaNodejs );
};
