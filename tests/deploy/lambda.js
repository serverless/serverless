'use strict';

var JawsError = require('../../lib/jaws-error'),
    path = require('path'),
    fs = require('fs'),
    assert = require('chai').assert;

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'mystage',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default',
    JAWS = null;

var backDir = path.join('/Users/ryan/jawstests/my-project', 'back');  //process.env.TEST_PROJECT_DIR
// Tests
describe('Test deployment', function() {
  before(function(done) {
    process.chdir(path.join(backDir, 's3-tests'));
    JAWS = require('../../lib/index.js');
    done();
  });

  it('deploy lambda', function(done) {
    this.timeout(0);

    JAWS.deployLambdas(stage, false, false)
        .then(function(d) {
          console.log(d);
          done();
        })
        .error(function(e) {
          done(e);
        });
  });
});

