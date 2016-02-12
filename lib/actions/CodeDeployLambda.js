'use strict';

/**
 * Action: Code Deploy: Lambda
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

  class CodeDeployLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + CodeDeployLambda.name;
    }

    registerActions() {

      this.S.addAction(this.codeDeployLambda.bind(this), {
        handler:     'codeDeployLambda',
        description: 'Uploads a Lambda\'s code to S3'
      });

      return BbPromise.resolve();
    }

    /**
     * Deploy Lambda code package
     */

    codeDeployLambda(evt) {
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

          _this.evt.data.functioName    =   _this.functionName;
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
      _this.meta     = _this.S.state.getMeta();
      _this.project  = _this.S.getProject();
      _this.function = _this.S.state.getFunctions({ paths: [_this.evt.options.path] })[0];

      // Set default function name
      _this.functionName = _this.function.getDeployedName({
        stage: _this.evt.options.stage,
        region: _this.evt.options.region
      });

      return BbPromise.resolve();
    }

    /**
     * Compress
     */

    _compress() {

      let zip = new Zip();

      this.evt.options.pathsPackaged.forEach(nc => {
        zip.file(nc.name, fs.readFileSync(nc.path));
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

      SUtils.sDebug(`"${this.evt.options.stage} - ${this.evt.options.region} - ${this.functionName}": Compressed file created - ${this.pathCompressed}`);

      return BbPromise.resolve();
    }

    /**
     * Upload
     * - Upload zip file to S3
     */

    _upload() {

      let _this = this;

      SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Uploading to project bucket...`);

      return _this.S3.sPutLambdaZip(
        _this.meta.variables.projectBucket,
        _this.project.name,
        _this.evt.options.stage,
        _this.functionName,
        fs.createReadStream(_this.pathCompressed))
        .then(function (s3Key) {

          // Store S3 Data
          _this.s3Bucket = _this.meta.variables.projectBucket;
          _this.s3Key = s3Key;

        });
    }

    /**
     * Provision
     * - Deploy Lambda
     */

    _provision() {

      let _this = this;

      var params = {
        FunctionName: _this.functionName,
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

          // Create or Update Lambda
          if (!_this.lambda) {

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.function.functionName}": Creating Lambda function...`);

            // Create Lambda
            let params = {
              Code: {
                ZipFile: _this.zipBuffer
              },
              FunctionName: _this.functionName, /* required */
              Handler:      _this.function.handler, /* required */
              Role:         _this.function.customRole ? _this.function.customRole : _this.meta.stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda, /* required */
              Runtime:      _this.function.getRuntime().getName(), /* required */
              Description:  'Serverless Lambda function for project: ' + _this.project.name,
              MemorySize:   _this.function.memorySize,
              Publish:      true, // Required by Serverless Framework & recommended best practice by AWS
              Timeout:      _this.function.timeout,
              VpcConfig: {
                SecurityGroupIds: _this.function.vpc.securityGroupIds,
                SubnetIds: _this.function.vpc.subnetIds
              }
            };

            return _this.Lambda.createFunctionPromised(params)
              .then(function (data) {

                // Save Version & Lambda
                _this.lambdaVersion = data.Version;
                _this.lambda = data;
              })

          } else {

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Updating Lambda configuration...`);

            // Update Configuration

            let params = {
              FunctionName: _this.lambda.Configuration.FunctionName, /* required */
              Description: 'Serverless Lambda function for project: ' + _this.project.name,
              Handler:      _this.function.handler,
              MemorySize:   _this.function.memorySize,
              Role:         _this.function.customRole ? _this.function.customRole : _this.meta.stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda,
              Timeout:      _this.function.timeout,
              VpcConfig: {
                SecurityGroupIds: _this.function.vpc.securityGroupIds,
                SubnetIds: _this.function.vpc.subnetIds
              }
            };

            return _this.Lambda.updateFunctionConfigurationPromised(params)
              .then(function () {
                SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Updating Lambda function...`);

                // Update Lambda Code
                let params = {
                  FunctionName: _this.lambda.Configuration.FunctionName, /* required */
                  Publish:      true, // Required by Serverless Framework & recommended by AWS
                  ZipFile:      _this.zipBuffer
                };

                // Update Function

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

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Updating Lambda Alias for version - ${_this.lambdaVersion}`);

            let params = {
              FunctionName:     _this.lambda.FunctionName,   /* required */
              FunctionVersion:  _this.lambdaVersion, /* required */
              Name:             _this.lambdaAlias, /* required */
              Description:      'Project: '
              + _this.project.name
              + ' Stage: '
              + _this.evt.options.stage
            };

            return _this.Lambda.updateAliasPromised(params);

          } else {

            // Create New Alias

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Creating New Lambda Alias for version - ${_this.lambdaVersion}`);

            let params = {
              FunctionName:    _this.lambda.FunctionName,   /* required */
              FunctionVersion: _this.lambdaVersion, /* required */
              Name:            _this.lambdaAlias,   /* required */
              Description:     'Project: '
              + _this.project.name
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

  return( CodeDeployLambda );
};
