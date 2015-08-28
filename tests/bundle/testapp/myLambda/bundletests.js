'use strict';

var AWS = require('aws-sdk'),
    s3 = new AWS.S3();

//Promise = require('bluebird'),
//s3 = Promise.promisifyAll(new AWS.S3());

AWS.config.credentials = new AWS.SharedIniFileCredentials({
  profile: 'default',
});
AWS.config.update({
  region: 'us-east-1',
});

var bucketName = 'jawstest.doapps.com';

//module.exports.run = function() {
var params = {
  Bucket: bucketName,
  Key: 'JAWS/envVars/jaws-test-n1wxsfw3/unittest',
};
s3.getObject(params, function(err, data) {
  if (err) {
    console.error(err);
  } else {
    console.log('got from s3', data.Body);
  }
});

//};
