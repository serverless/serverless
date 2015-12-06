'use strict';

/**
 * Serverless Services: AWS: S3
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    async     = require('async'),
    AWS       = require('aws-sdk'),
    SUtils = require('../../utils'),
    SError    = require('../../ServerlessError'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  const S3 = BbPromise.promisifyAll(new AWS.S3(config), { suffix: "Promised" });

  /**
   * Create Bucket
   */

  S3.sCreateBucket = function(bucketName) {
    return S3.getBucketAclPromised({Bucket: bucketName})
      .then(function(response) {
        SUtils.sDebug(`Project bucket already exists: ${bucketName}`);
      })
      .error(function(err) {

        if (err.code == 'AccessDenied') {
          throw new SError(
            `Bucket ${bucketName} already exists and you do not have permissions to use it`,
            SError.errorCodes.ACCESS_DENIED
          );
        }

        return S3.createBucketPromised({
          Bucket: bucketName,
          ACL:    'private',
        });
      });
  };
  
  /**
   * Get the env file for a given stage
   */

  S3.sGetEnvFile = function(bucketName, projectName, stage) {
    let key    = ['Serverless', projectName, stage, 'envVars', '.env'].join('/'),
        params = {
          Bucket: bucketName,
          Key:    key,
        };
    SUtils.sDebug(`env get s3 bucket: ${bucketName} key: ${key}`);
    return S3.getObjectPromised(params)
  };
  
  /**
   * Get Object
   */
  S3.sPutEnvFile = function(bucketName, projectName, stage, contents) {
    let params = {
      Bucket:      bucketName,
      Key:         ['Serverless', projectName, stage, 'envVars', '.env'].join('/'),
      ACL:         'private',
      ContentType: 'text/plain',
      Body:        contents,
    };

    return S3.putObjectPromised(params);
  };
  
  /**
   * Put up deployment zip for a given stage
   */
  S3.sPutLambdaZip = function(bucketName, projectName, stage, lambdaName, body) {

    let d      = new Date(),
        key    = ['Serverless', projectName, stage, 'lambdas', lambdaName + '@' + d.getTime() + '.zip'].join('/'),
        params = {
          Bucket:      bucketName,
          Key:         key,
          ACL:         'private',
          ContentType: 'application/zip',
          Body:        body,
        };

    SUtils.sDebug(`lambda zip s3 key: ${key}`);

    return S3.uploadPromised(params)
      .then(() => {
        return key;
      });
  };

  // Return configured, customized instance
  return S3;
};
