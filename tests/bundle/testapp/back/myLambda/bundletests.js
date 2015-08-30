//'use strict';
//
//var AWS = require('aws-sdk'),
//    s3 = new AWS.S3();
//
////Promise = require('bluebird'),
////s3 = Promise.promisifyAll(new AWS.S3());
//
//var bucketName = 'jawstest.doapps.com';
//
////module.exports.run = function() {
//var params = {
//  Bucket: bucketName,
//  Key: 'JAWS/envVars/jaws-test-n1wxsfw3/unittest',
//};
//s3.getObject(params, function(err, data) {
//  if (err) {
//    console.error(err);
//  } else {
//    console.log('got from s3', data.Body);
//  }
//});
//
////};

var AWS = require('aws-sdk');

var s3 = new AWS.S3();
s3.listBuckets(function(err, data) {
  console.log(err, data);
});

//var Promise = require('bluebird');
//
//Promise
//    .resolve('abc')
//    .then(function(d) {
//      console.log(d);
//    });
