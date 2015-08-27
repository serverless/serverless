'use strict';

var JAWS = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error'),
    path = require('path'),
    assert = require('chai').assert;

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'unittest',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

var backDir = path.join(process.env.TEST_PROJECT_DIR, 'back');

// Tests
describe('tag command', function() {
  before(function(done) {
    this.timeout(0);

    fs.mkdirSync(backDir);

    process.chdir(backDir);
    
    done();
  });

  it('tag one', function(done) {
    this.timeout(0);

    JAWS.new(projName, stage, process.env.TEST_JAWS_S3_BUCKET, lambdaRegion, notificationEmail, awsProfile)
        .then(function() {
          var jawsJson = require(process.env.TEST_PROJECT_DIR + '/' + process.env.TEST_PROJECT_NAME + '/jaws.json');
          assert.isTrue(!!jawsJson.project.regions['us-east-1'].stages[stage].iamRoleArn);
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
