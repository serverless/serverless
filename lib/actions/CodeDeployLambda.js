'use strict';

/**
 * Action: Code Deploy: Lambda
 * - Don't attach "options" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently.
 */

module.exports   = function(S) {

  const path     = require('path'),
    SUtils       = S.utils,
    SError       = require(S.getServerlessPath('Error')),
    BbPromise    = require('bluebird'),
    Zip          = require('node-zip'),
    fs           = BbPromise.promisifyAll(require('fs'));

  class CodeDeployLambda extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.codeDeployLambda.bind(this), {
        handler:     'codeDeployLambda',
        description: 'Uploads Lambda code and provisions it on AWS'
      });

      return BbPromise.resolve();
    }

    /**
     * Deploy Lambda code package
     */

    codeDeployLambda(evt) {
      let deployer = new Deployer();
      return deployer.deploy(evt);
    }
  }

  /**
   * Deployer Class
   * - Necessary for this action to run concurrently
   */

  class Deployer {
    deploy(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._compress)
        .then(_this._provision)
        .then(_this._alias)
        .then(function() {

          /**
           * Return EVT
           */

          _this.evt.data.functioName      =   _this.functionName;
          _this.evt.data.pathCompressed   =   _this.pathCompressed;
          _this.evt.data.functionVersion  =   _this.functionVersion;
          _this.evt.data.functionAliasArn =   _this.functionAliasArn;
          return _this.evt;

        });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {

      let _this = this;
      // TODO: Validate Options

      // Instantiate Classes
      _this.aws      = S.getProvider();
      _this.project  = S.getProject();
      _this.function = S.getProject().getFunction( _this.evt.options.name );
      _this.functionPopulated = _this.function.toObjectPopulated({ stage: _this.evt.options.stage, region: _this.evt.options.region });

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

      // Set zipfile name
      this.zipName = `${this.function.getName()}_${this.evt.options.stage}_${this.evt.options.region}`;

      // Compress
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

      // Create compressed package
      this.pathCompressed = path.join(this.project.getTempPath(), this.zipName);
      fs.writeFileSync(this.pathCompressed, this.zipBuffer);
      SUtils.sDebug(`"${this.evt.options.stage} - ${this.evt.options.region} - ${this.functionName}": Compressed file created - ${this.pathCompressed}`);

      return BbPromise.resolve();
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

      return _this.aws.request('Lambda', 'getFunction', params, _this.evt.options.stage, _this.evt.options.region)
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
              Handler:      _this.function.getRuntime().getHandler(_this.function), /* required */
              Role:         _this.functionPopulated.customRole ? _this.functionPopulated.customRole : _this.project.getVariablesObject(_this.evt.options.stage, _this.evt.options.region).iamRoleArnLambda, /* required */
              Runtime:      _this.function.getRuntime().getName('aws'), /* required */
              Description:  'Serverless Lambda function for project: ' + _this.project.name,
              MemorySize:   _this.functionPopulated.memorySize,
              Publish:      true, // Required by Serverless Framework & recommended best practice by AWS
              Timeout:      _this.functionPopulated.timeout,
              VpcConfig: {
                SecurityGroupIds: _this.functionPopulated.vpc.securityGroupIds,
                SubnetIds:        _this.functionPopulated.vpc.subnetIds
              }
            };

            return _this.aws.request('Lambda', 'createFunction', params, _this.evt.options.stage, _this.evt.options.region)
              .then(function (data) {

                // Save Version & Lambda
                _this.functionVersion = data.Version;
                _this.lambda = data;
              })

          } else {

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Updating Lambda configuration...`);

            // Update Configuration
            let params = {
              FunctionName: _this.lambda.Configuration.FunctionName, /* required */
              Description: 'Serverless Lambda function for project: ' + _this.project.name,
              Handler:      _this.function.getRuntime().getHandler(_this.function),
              MemorySize:   _this.functionPopulated.memorySize,
              Role:         _this.functionPopulated.customRole ? _this.functionPopulated.customRole : _this.project.getVariablesObject(_this.evt.options.stage, _this.evt.options.region).iamRoleArnLambda,
              Timeout:      _this.functionPopulated.timeout,
              VpcConfig: {
                SecurityGroupIds: _this.functionPopulated.vpc.securityGroupIds,
                SubnetIds: _this.functionPopulated.vpc.subnetIds
              }
            };

            return _this.aws.request('Lambda', 'updateFunctionConfiguration', params, _this.evt.options.stage, _this.evt.options.region)
              .then(function () {
                SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Updating Lambda function...`);

                // Update Lambda Code
                let params = {
                  FunctionName: _this.lambda.Configuration.FunctionName, /* required */
                  Publish:      true, // Required by Serverless Framework & recommended by AWS
                  ZipFile:      _this.zipBuffer
                };

                // Update Function
                return _this.aws.request('Lambda', 'updateFunctionCode', params, _this.evt.options.stage, _this.evt.options.region)
                  .then(function (data) {

                    // Save Version & Lambda
                    _this.functionVersion = data.Version;
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

      let _this           = this;
      let aliasedLambda   = false;
      _this.functionAlias = _this.evt.options.functionAlias ? _this.evt.options.functionAlias : _this.evt.options.stage.toLowerCase();

      var params = {
        FunctionName: _this.lambda.FunctionName, /* required */
        Name:         _this.functionAlias /* required */
      };

      return _this.aws.request('Lambda', 'getAlias', params, _this.evt.options.stage, _this.evt.options.region)
        .then(function() {
          aliasedLambda = true;
        }, function(e) {
          aliasedLambda = false;
        })
        .then(function() {

          if (aliasedLambda) {

            // Update Existing Alias

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Updating Lambda Alias for version - ${_this.functionVersion}`);

            let params = {
              FunctionName:     _this.lambda.FunctionName,   /* required */
              FunctionVersion:  _this.functionVersion, /* required */
              Name:             _this.functionAlias, /* required */
              Description:      'Project: '
              + _this.project.name
              + ' Stage: '
              + _this.evt.options.stage
            };

            return _this.aws.request('Lambda', 'updateAlias', params, _this.evt.options.stage, _this.evt.options.region);

          } else {

            // Create New Alias

            SUtils.sDebug(`"${_this.evt.options.stage} - ${_this.evt.options.region} - ${_this.functionName}": Creating New Lambda Alias for version - ${_this.functionVersion}`);

            let params = {
              FunctionName:    _this.lambda.FunctionName,   /* required */
              FunctionVersion: _this.functionVersion, /* required */
              Name:            _this.functionAlias,   /* required */
              Description:     'Project: '
              + _this.project.name
              + ' Stage: '
              + _this.evt.options.stage
            };

            return _this.aws.request('Lambda', 'createAlias', params, _this.evt.options.stage, _this.evt.options.region);
          }
        })
        .then(function(data) {

          // Save Alias
          _this.functionAliasArn  = data.AliasArn;
        });
    }
  }

  return( CodeDeployLambda );
};
