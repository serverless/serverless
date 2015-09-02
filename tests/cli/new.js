'use strict';

/**
 * JAWS Test: New Command
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */
var path = require('path'),
    os = require('os'),
    assert = require('chai').assert,
    shortid = require('shortid');

var config = require('../config');

describe('Test new command', function() {

  before(function(done) {
    config.newName = 'jaws-test-' + shortid.generate();
    process.chdir(os.tmpdir());
    done();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Create new project', function(done) {

      this.timeout(0);

      // Require
      var JAWS = require('../../lib/index.js'),
          JawsError = require('../../lib/jaws-error');

      // Test
      JAWS.new(
          config.newName,
          config.stage,
          config.envBucket,
          config.region,
          config.notifyEmail,
          config.profile
      )
          .then(function() {
            var jawsJson = require(path.join(os.tmpdir(), config.newName, 'jaws.json'));
            assert.isTrue(!!jawsJson.project.regions['us-east-1'].stages[config.stage].iamRoleArn);
            done();
          })
          .catch(JawsError, function(e) {
            done(e);
          })
          .error(function(e) {
            done(e);
          });
    });
  });

  describe('Error tests', function() {
    it('Create new project', function(done) {
      done();
    })
  });

  //it('Delete Cloudformation stack from new project', function(done) {
  //  this.timeout(0);
  //  var CF = new config.AWS.CloudFormation();
  //  CF.deleteStack({ StackName: config.stage + '-' + config.name }, function(err, data) {
  //    if (err) console.log(err, err.stack);
  //    done();
  //  });
  //});
});