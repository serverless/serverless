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

    codeDeployLambdaNodejs(options) {
      let deployer = new Deployer(this.S);
      return deployer.deploy(options);
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

    deploy(options) {

      let _this     = this;
      _this.options = options;

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._compress)
        .then(_this._upload)
        .then(_this._deploy)
        .then(_this._alias)
        .then(function() {

          /**
           * Return Action Data
           * - WARNING: Adjusting these will break Plugins
           */

          return {
            options:          _this.options,
            pathCompressed:   _this.pathCompressed,
            s3Bucket:         _this.s3Bucket,
            s3Key:            _this.S3Key,
            lambdaVersion:    _this.lambdaVersion,
            lambdaAlias:      _this.lambdaAlias,
            lambdaAliasArn:   _this.lambdaAliasArn
          };
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
        region:          _this.options.region,
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
        module:   _this.options.module,
        function: _this.options.function
      });

      return BbPromise.resolve();
    }

    /**
     * Compress
     */

    _compress() {

      let zip = new Zip();

      this.options.pathsPackaged.forEach(nc => {
        zip.file(nc.fileName, nc.data);
      });

      let zipBuffer = zip.generate({
        type:        'nodebuffer',
        compression: 'DEFLATE'
      });

      if (zipBuffer.length > 52428800) {
        BbPromise.reject(new SError(
          'Zip file is > the 50MB Lambda queued limit (' + zipBuffer.length + ' bytes)',
          SError.errorCodes.ZIP_TOO_BIG)
        );
      }

      // Set path of compressed package
      this.pathCompressed = path.join(this.options.pathDist, 'package.zip');

      // Create compressed package
      fs.writeFileSync(this.pathCompressed, zipBuffer);

      SUtils.sDebug(`"${this.options.stage} - ${this.options.region} - ${this.function.data.name}": Compressed file created - ${this.pathCompressed}`);

      return BbPromise.resolve();
    }

    /**
     * Upload
     * - Upload zip file to S3
     */

    _upload() {

      let _this = this;

      SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Uploading to project bucket...`);

      return _this.S3.sPutLambdaZip(
        _this.meta.data.private.variables.projectBucket,
        _this.project.data.name,
        _this.options.stage,
        _this.function.data.name,
        fs.createReadStream(_this.pathCompressed))
        .then(function(s3Key) {

          // Store S3 Data
          _this.s3Bucket = _this.meta.data.private.variables.projectBucket;
          _this.s3Key    = s3Key;

          return BbPromise.resolve();
        });
    }

    /**
     * Deploy
     * - Deploy Lambda from S3 to Lambda
     */

    _deploy() {

      let _this = this;

      var params = {
        FunctionName: _this.Lambda.sGetLambdaName(_this.project.data.name, _this.function.data.name),
        Qualifier:    '$LATEST'
      };

      return _this.Lambda.getFunctionPromised(params)
        .catch(function(e) {
          _this.lambda = null;
        })
        .then(function(data) {
          _this.lambda = data;
        })
        .then(function() {

          // Create or Update Lambda

          if (!_this.lambda) {

            SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Creating Lambda function...`);

            // Create Lambda
            let params = {
              Code: {
                S3Bucket:   _this.s3Bucket,
                S3Key:      _this.s3Key
              },
              FunctionName: _this.Lambda.sGetLambdaName(_this.project.data.name, _this.function.data.name), /* required */
              Handler:      _this.function.data.handler, /* required */
              Role:         _this.meta.data.private.stages[_this.options.stage].regions[_this.options.region].variables.iamRoleArnLambda, /* required */
              Runtime:      _this.function.data.runtime, /* required */
              Description: 'Serverless Lambda function for project: ' + _this.project.data.name,
              MemorySize:   _this.function.data.memorySize,
              Publish:      true, // Required by Serverless Framework & recommended best practice by AWS
              Timeout:      _this.function.data.timeout
            };

            return _this.Lambda.createFunctionPromised(params)
              .then(function(data) {

                // Save Version & Lambda
                _this.lambdaVersion = data.Version;
                _this.lambda        = data;
              });

          } else {

            SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Updating Lambda configuration...`);

            let params = {
              FunctionName: _this.lambda.Configuration.FunctionName, /* required */
              Description:  'Serverless Lambda function for project: ' + _this.project.data.name,
              Handler:      _this.function.data.handler,
              MemorySize:   _this.function.data.memorySize,
              Role:         _this.meta.data.private.stages[_this.options.stage].regions[_this.options.region].variables.iamRoleArnLambda,
              Timeout:      _this.function.data.timeout
            };

            return _this.Lambda.updateFunctionConfigurationPromised(params)
              .then(function(){
                SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Updating Lambda function...`);

                // Update Lambda Code
                let params = {
                  FunctionName:  _this.lambda.Configuration.FunctionName, /* required */
                  Publish:       true, // Required by Serverless Framework & recommended by AWS
                  S3Bucket:      _this.meta.data.private.variables.projectBucket,
                  S3Key:         _this.s3Key
                };

                return _this.Lambda.updateFunctionCodePromised(params)
                  .then(function(data) {

                    // Save Version & Lambda
                    _this.lambdaVersion = data.Version;
                    _this.lambda        = data;
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
      _this.lambdaAlias = _this.options.stage.toLowerCase();

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

            SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Updating Lambda Alias for version - ${_this.lambdaVersion}`);

            let params = {
              FunctionName:     _this.lambda.FunctionName,   /* required */
              FunctionVersion:  _this.lambdaVersion, /* required */
              Name:             _this.lambdaAlias, /* required */
              Description:      'Project: '
              + _this.project.data.name
              + ' Stage: '
              + _this.options.stage
            };

            return _this.Lambda.updateAliasPromised(params);

          } else {

            // Create New Alias

            SUtils.sDebug(`"${_this.options.stage} - ${_this.options.region} - ${_this.function.data.name}": Creating New Lambda Alias for version - ${_this.lambdaVersion}`);

            let params = {
              FunctionName:    _this.lambda.FunctionName,   /* required */
              FunctionVersion: _this.lambdaVersion, /* required */
              Name:            _this.lambdaAlias,   /* required */
              Description:     'Project: '
              + _this.project.data.name
              + ' Stage: '
              + _this.options.stage
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