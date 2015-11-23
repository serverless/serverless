'use strict';

/**
 * Action: Code Upload: Lambda: Nodejs
 * - Uploads a single Lambda's code to their JAWS project bucket
 * - Don't attach "evt" to context, it will be overwritten in concurrent operations
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class CodeUploadLambdaNodejs extends JawsPlugin {

  /**
   * Constructor
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'jaws.core.' + CodeUploadLambdaNodejs.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.Jaws.addAction(this.codeUploadLambdaNodejs.bind(this), {
      handler:       'codeUploadLambdaNodejs',
      description:   'Uploads a Lambda\'s code to S3'
    });

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  codeUploadLambdaNodejs(evt) {

    let _this = this;

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };
    _this.S3              = require('../../utils/aws/S3')(awsConfig);
    _this.AwsMisc         = require('../../utils/aws/Misc');

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._upload)
        .then(function() {
          return evt;
        })
        .catch(function(e) {
          console.log(e.stack)
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare(evt) {
    return BbPromise.resolve(evt);
  }

  /**
   * Upload
   * - Upload zip file to S3
   */

  _upload(evt) {

    let _this = this;

    JawsUtils.jawsDebug(`Uploading ${evt.function.name} to ${evt.region.regionBucket}`);

    return _this.S3.sPutLambdaZip(
        evt.region.regionBucket,
        _this.Jaws._projectJson.name,
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
              }
            }
          }

          return BbPromise.resolve(evt);
        });
  }
}

module.exports = CodeUploadLambdaNodejs;