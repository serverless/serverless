'use strict';

/**
 * JAWS Test: New Command
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */
var path = require('path'),
    os = require('os'),
    assert = require('chai').assert,
    testUtils = require('../test_utils'),
    shortid = require('shortid'),
    AWS = require('aws-sdk');

module.exports = function(testData, cb) {

  describe('Test new command', function() {

    before(function(done) {
      testData.newName = 'jaws-test-' + shortid.generate();
      process.chdir(os.tmpdir());
      done();
    });

    after(function(done) {
      cb(testData);
      done();
    });

    it('Create new project without errors', function(done) {

      this.timeout(0);

      // Require
      var JAWS = require('../../lib/index.js'),
          JawsError = require('../../lib/jaws-error');

      // Test
      JAWS.new(
          testData.newName,
          testData.stage,
          testData.envBucket,
          testData.region,
          testData.notifyEmail,
          testData.profile
      )
          .then(function() {
            var jawsJson = require(path.join(os.tmpdir(), testData.newName, 'jaws.json'));
            assert.isTrue(!!jawsJson.project.regions['us-east-1'].stages[testData.stage].iamRoleArn);
            done();
          })
          .catch(JawsError, function(e) {
            done(e);
          })
          .error(function(e) {
            done(e);
          });
    });

    //it('Delete Cloudformation stack from new project', function(done) {
    //  this.timeout(0);
    //  var CF = new testData.AWS.CloudFormation();
    //  CF.deleteStack({ StackName: testData.stage + '-' + testData.name }, function(err, data) {
    //    if (err) console.log(err, err.stack);
    //    done();
    //  });
    //});
  });
};