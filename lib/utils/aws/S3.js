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
  SCli      = require('../../utils/cli'),
  SUtils    = require('../../utils'),
  SError    = require('../../ServerlessError'),
  fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  let S3 = BbPromise.promisifyAll(new AWS.S3(config), { suffix: "Promised" });

  /**
   * Get Project Bucket Region (From Title)
   * - This resets the current S3 instance to use the project bucket's configuration
   */

  S3.sSetProjectBucketConfig = function(bucketName) {

    let region;
    if (bucketName.indexOf('us-east-1') !== -1) region = 'us-east-1';
    else if (bucketName.indexOf('us-west-2') !== -1) region = 'us-west-2';
    else if (bucketName.indexOf('eu-west-1') !== -1) region = 'eu-west-1';
    else if (bucketName.indexOf('ap-northeast-1') !== -1) region = 'ap-northeast-1';
    else throw new SError(`Project bucket does not contain a valid project region in its bucket name (us-east-1, us-west-2, eu-west-1, ap-northeast-1)`);

    // Update S3
    S3 = BbPromise.promisifyAll(new AWS.S3(
      {
        region:          region,
        accessKeyId:     S3.config.accessKeyId,
        secretAccessKey: S3.config.secretAccessKey
      }
      ),
      {
        suffix: "Promised"
      }
    );
  };

  /**
   * Create Bucket
   */

  S3.sCreateBucket = function(bucketName) {

    // Set S3 Config To Project Bucket
    S3.sSetProjectBucketConfig(bucketName);

    return S3.getBucketAclPromised({ Bucket: bucketName })
      .then(function(response) {
        SUtils.sDebug(`Project bucket already exists: ${bucketName}`);
      })
      .catch(function(err) {

        if (err.code == 'AccessDenied') {

          throw new SError(
            `S3 Bucket "${bucketName}" already exists and you do not have permissions to use it`,
            SError.errorCodes.ACCESS_DENIED
          );

        } else if (err.code == 'NoSuchBucket') {

          SCli.log('Creating your project bucket on S3: ' + bucketName + '...');
          return S3.createBucketPromised({
            Bucket: bucketName,
            ACL:    'private'
          });

        } else {

          // Otherwise throw error
          throw new SError(err);
        }
      });
  };

  /**
   * Get the env file for a given stage
   */

  S3.sGetEnvFile = function(bucketName, projectName, stage, region) {

    // Set S3 Config To Project Bucket
    S3.sSetProjectBucketConfig(bucketName);

    let key  = ['serverless', projectName, stage, region, 'envVars', '.env'].join('/'),
      params = {
        Bucket: bucketName,
        Key:    key
      };

    SUtils.sDebug(`Getting ENV Vars: ${bucketName} - ${key}`);
    return S3.getObjectPromised(params);
  };

  /**
   * Put ENV file
   */

  S3.sPutEnvFile = function(bucketName, projectName, stage, region, contents) {

    // Set S3 Config To Project Bucket
    S3.sSetProjectBucketConfig(bucketName);

    let params = {
      Bucket:      bucketName,
      Key:         ['serverless', projectName, stage, region, 'envVars', '.env'].join('/'),
      ACL:         'private',
      ContentType: 'text/plain',
      Body:        contents
    };

    return S3.putObjectPromised(params);
  };

  /**
   * Put up deployment zip for a given stage
   */

  S3.sPutLambdaZip = function(bucketName, projectName, stage, lambdaName, body) {

    // Set S3 Config To Project Bucket
    S3.sSetProjectBucketConfig(bucketName);

    let d    = new Date(),
      key    = ['serverless', projectName, stage, 'lambdas', lambdaName + '@' + d.getTime() + '.zip'].join('/'),
      params = {
        Bucket:      bucketName,
        Key:         key,
        ACL:         'private',
        ContentType: 'application/zip',
        Body:        body
      };

    SUtils.sDebug(`Uploading Lambda Zip File: ${key}`);

    return S3.uploadPromised(params)
      .then(() => {
        return key;
      });
  };

  /**
   * Put CF File On S3
   */

  S3.sPutCfFile = function(bucketName, projectName, stage, region, cfTemplate) {

    // Set S3 Config To Project Bucket
    S3.sSetProjectBucketConfig(bucketName);

    let d    = new Date(),
      key    = ['serverless', projectName, stage, region, 'resources/' + 's-resources-cf'].join('/') + '@' + d.getTime() + '.json',
      params = {
        Bucket:      bucketName,
        Key:         key,
        ACL:         'private',
        ContentType: 'application/json',
        Body:        JSON.stringify(cfTemplate)
      };

    return S3.putObjectPromised(params)
      .then(function() {

        // TemplateURL is an https:// URL. You force us to lookup endpt vs bucket/key attrs!?!? wtf not cool
        let s3 = new AWS.S3();
        return 'https://' + s3.endpoint.hostname + `/${bucketName}/${key}`;
      });
  };

  // Return configured, customized instance
  return S3;
};
