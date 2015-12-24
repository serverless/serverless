'use strict';

/**
 * S3 Events
 */

let SError    = require('../../../ServerlessError'),
    BbPromise = require('bluebird');

/**
 * S3
 * - Required Properties: bucket, functionName, bucketEvents
 */

module.exports.notification = function(awsConfig, functionName, event, done) {

  //if (!functionName || !event.bucket || !event.bucketEvents) {
  //  return BbPromise.reject(new SError(`Missing function name, bucket name, or bucket events array.`));
  //}

  //let awsConfig = {
  //  region:          region,
  //  accessKeyId:     S._awsAdminKeyId,
  //  secretAccessKey: S._awsAdminSecretKey
  //};
  const S3 = require('../S3')(awsConfig);

  //let accountNumber = event.region.iamRoleArnLambda.replace('arn:aws:iam::', '').split(':')[0],
  //    functionArn   = 'arn:aws:lambda:' + awsConfig.region + ':' + accountNumber + ':function:' + functionName + ':' + event.stage;

  let params = {
    Bucket: event.bucket,
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Events: event.bucketEvents,
          LambdaFunctionArn: functionArn
        }
      ]
    }
  };

  S3.putBucketNotificationConfiguration(params, function(err, data) {

    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
    done();
  });

};