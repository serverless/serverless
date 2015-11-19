'use strict';

/**
 * Action: Code Upload: Lambda: Nodejs
 * - Uploads a single Lambda's code to their JAWS project bucket
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
    _this.evt = evt;

    // Load AWS Service Instances
    let awsConfig = {
      region:          _this.evt.region.region,
      accessKeyId:     _this.Jaws._awsAdminKeyId,
      secretAccessKey: _this.Jaws._awsAdminSecretKey,
    };
    _this.S3              = require('../../utils/aws/S3')(awsConfig);
    _this.AwsMisc         = require('../../utils/aws/Misc');

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._upload)
        .then(function() {
          return _this.evt;
        })
        .catch(function(e) {
          console.log(e.stack)
        });
  }

  /**
   * Validate And Prepare
   */

  _validateAndPrepare() {
    Promise.resolve();
  }

  /**
   * Upload
   * - Upload zip file to S3
   */

  _upload() {

    let _this = this;

    JawsUtils.jawsDebug(`Uploading ${_this.evt.function.name} to ${_this.evt.region.jawsBucket}`);

    return _this.S3.sPutLambdaZip(
        _this.evt.region.jawsBucket,
        _this.Jaws._projectJson.name,
        _this.evt.stage,
        _this.evt.function.name,
        fs.createReadStream(_this.evt.function.pathCompressed))
        .then(function(s3Key) {

          _this.evt.function.s3Key = s3Key;
          return BbPromise.resolve();
        });
  }
}

module.exports = CodeUploadLambdaNodejs;