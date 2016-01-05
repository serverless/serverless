'use strict';

/**
 * Action: Code Upload: Lambda: Nodejs
 * - Uploads a single Lambda's code to their Serverless project bucket
 * - Don't attach "options" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently.
 */

module.exports   = function(SPlugin, serverlessPath) {
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
   * Deployer Class
   * - Necessary for this action to run concurrently
   */

  class Deployer {

    constructor(S) {
      this.S = S;
    }

    deploy(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._compress)
        .then(function() {
          return [_this._upload(), _this._provision()];
        })
        .map(function(func) {
          return func;
        }, { concurrency: 3 })
        .then(_this._alias)
        .then(function() {

          /**
           * Return EVT
           */

          _this.evt.data.pathCompressed =   _this.pathCompressed;
          _this.evt.data.s3Bucket       =   _this.s3Bucket;
          _this.evt.data.s3Key          =   _this.s3Key;
          _this.evt.data.lambdaVersion  =   _this.lambdaVersion;
          _this.evt.data.lambdaAlias    =   _this.lambdaAlias;
          _this.evt.data.lambdaAliasArn =   _this.lambdaAliasArn;
          return _this.evt;

        });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {

      let _this = this;

      // TODO: Validate Options

      // Load AWS Service Instances
      let awsConfig  = {
        region:          _this.evt.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };
      _this.S3       = require('../utils/aws/S3')(awsConfig);
      _this.Lambda   = require('../utils/aws/Lambda')(awsConfig);
      _this.AwsMisc  = require('../utils/aws/Misc');

      // Instantiate Classes
      _this.meta     = new _this.S.classes.Meta(_this.S);
      _this.project  = new _this.S.classes.Project(_this.S);
      _this.function = new _this.S.classes.Function(_this.S, {
        module:   _this.evt.options.module,
        function: _this.evt.options.function
      });

      return BbPromise.resolve();
    }

    /**
     * Compress
     */

    _compress() {

      let zip = new Zip();

      this.evt.options.pathsPackaged.forEach(nc => {
        zip.file(nc.fileName, nc.data);
      });

      this.zipBuffer = zip.generate({
        type:        'nodebuffer',
        compression: 'DEFLATE'
      });

      if (this.zipBuffer.length > 52428800) {
        BbPromise.reject(new SError(
          'Zip file is > the 50MB Lambda queued limit (' + this.zipBuffer.length + ' bytes)',
          SError.errorCodes.ZIP_TOO_BIG)
        );
      }

      // Set path of compressed package
      this.pathCompressed = path.join(this.evt.options.pathDist, 'package.zip');

      // Create compressed package
      fs.writeFileSync(this.pathCompressed, this.zipBuffer);

      SUtils.sDebug(`"${this.evt.options.stage} - ${this.evt.options.region} - ${this.function.data.name}": Compressed file created - ${this.pathCompressed}`);

      return BbPromise.resolve();
    }

    /**
     * Upload
     * - Upload zip file to S3
     */

    _upload() {
      console.log("uplaod to S3 started...");
      let _this = this;

      SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.data.name}": Uploading to project bucket...`);

      return _this.S3.sPutLambdaZip(
        _this.meta.data.private.variables.projectBucket,
        _this.project.data.name,
        _this.evt.options.stage,
        _this.function.data.name,
        fs.createReadStream(_this.pathCompressed))
        .then(function (s3Key) {
          console.log("uplaod to S3 completed.");
          // Store S3 Data
          _this.s3Bucket = _this.meta.data.private.variables.projectBucket;
          _this.s3Key = s3Key;

        });
    }

    /**
     * Provision
     * - Deploy Lambda
     */

    _provision() {
      console.log("upload to Lambda started...");
      let _this = this;

      var params = {
        FunctionName: _this.Lambda.sGetLambdaName(_this.project.data.name, _this.function.module, _this.function.data.name),
        Qualifier: '$LATEST'
      };

      return _this.Lambda.getFunctionPromised(params)
        .catch(function (e) {
          _this.lambda = null;
        })
        .then(function (data) {
          _this.lambda = data;
        })
        .then(function () {
          console.log("upload to Lambda completed.");
          // Create or Update Lambda
          if (!_this.lambda) {

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.data.name}": Creating Lambda function...`);

            // Create Lambda
            let params = {
              Code: {
                ZipFile: _this.zipBuffer
              },
              FunctionName: _this.Lambda.sGetLambdaName(_this.project.data.name, _this.function.module, _this.function.data.name), /* required */
              Handler: _this.function.data.handler, /* required */
              Role: _this.meta.data.private.stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda, /* required */
              Runtime: _this.function.data.runtime, /* required */
              Description: 'Serverless Lambda function for project: ' + _this.project.data.name,
              MemorySize: _this.function.data.memorySize,
              Publish: true, // Required by Serverless Framework & recommended best practice by AWS
              Timeout: _this.function.data.timeout
            };

            return _this.Lambda.createFunctionPromised(params)
              .then(function (data) {

                // Save Version & Lambda
                _this.lambdaVersion = data.Version;
                _this.lambda = data;
              })

          } else {

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.data.name}": Updating Lambda configuration...`);

            let params = {
              FunctionName: _this.lambda.Configuration.FunctionName, /* required */
              Description: 'Serverless Lambda function for project: ' + _this.project.data.name,
              Handler: _this.function.data.handler,
              MemorySize: _this.function.data.memorySize,
              Role: _this.meta.data.private.stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda,
              Timeout: _this.function.data.timeout
            };

            return _this.Lambda.updateFunctionConfigurationPromised(params)
              .then(function () {
                SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.data.name}": Updating Lambda function...`);

                // Update Lambda Code
                let params = {
                  FunctionName: _this.lambda.Configuration.FunctionName, /* required */
                  Publish: true, // Required by Serverless Framework & recommended by AWS
                  ZipFile: _this.zipBuffer
                };

                return _this.Lambda.updateFunctionCodePromised(params)
                  .then(function (data) {

                    // Save Version & Lambda
                    _this.lambdaVersion = data.Version;
                    _this.lambda = data;
                  });
              });
          }
        })
    }

    /**
     * Alias Lambda w/ Stage
     */

    _alias() {

      let _this         = this;
      let aliasedLambda = false;
      _this.lambdaAlias = _this.evt.options.stage.toLowerCase();

      var params = {
        FunctionName: _this.lambda.FunctionName, /* required */
        Name:         _this.lambdaAlias /* required */
      };

      return _this.Lambda.getAliasPromised(params)
        .then(function() {
          aliasedLambda = true;
        }, function(e) {
          aliasedLambda = false;
        })
        .then(function() {

          if (aliasedLambda) {

            // Update Existing Alias

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.data.name}": Updating Lambda Alias for version - ${_this.lambdaVersion}`);

            let params = {
              FunctionName:     _this.lambda.FunctionName,   /* required */
              FunctionVersion:  _this.lambdaVersion, /* required */
              Name:             _this.lambdaAlias, /* required */
              Description:      'Project: '
              + _this.project.data.name
              + ' Stage: '
              + _this.evt.options.stage
            };

            return _this.Lambda.updateAliasPromised(params);

          } else {

            // Create New Alias

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.data.name}": Creating New Lambda Alias for version - ${_this.lambdaVersion}`);

            let params = {
              FunctionName:    _this.lambda.FunctionName,   /* required */
              FunctionVersion: _this.lambdaVersion, /* required */
              Name:            _this.lambdaAlias,   /* required */
              Description:     'Project: '
              + _this.project.data.name
              + ' Stage: '
              + _this.evt.options.stage
            };

            return _this.Lambda.createAliasPromised(params);
          }
        })
        .then(function(data) {

          // Save Alias
          _this.lambdaAliasArn  = data.AliasArn;
        });
    }
  }

  return( CodeDeployLambdaNodejs );
};