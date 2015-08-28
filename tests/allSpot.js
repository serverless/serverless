'use strict';

/**
 * JAWS: Spot Tests
 * @type {async|exports|module.exports}
 */

var async = require('async');

// Define Test Data
var testData = {};

// Require Tests
var tests = [
  require('./deploy/api'),
];

// Run Tests
async.eachSeries(tests, function(test, cb) {

  test(testData, function(testData) {
    return cb();
  });

}, function(error) {
  console.log('Tests completed');
});

