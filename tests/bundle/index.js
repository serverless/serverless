'use strict';

/**
 * Bundle tests
 */

var JAWS = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error'),
    path = require('path'),
    fs = require('fs'),
    assert = require('chai').assert;

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'unittest',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

describe('bundle tests', function() {

  it('Existing aws creds', function(done) {
    this.timeout(0);

    //JAWS.new(projName, stage, process.env.TEST_JAWS_S3_BUCKET, lambdaRegion, notificationEmail, awsProfile)
    JAWS.optimizeNodeJs(
        process.env.TEST_PROJECT_DIR,
        path.join(__dirname, 'testapp', 'myLambda', 'jaws.json')
    )
        .then(function(uglifiedBuffer) {
          //var jawsJson = require(process.env.TEST_PROJECT_DIR + '/' + process.env.TEST_PROJECT_NAME + '/jaws.json');
          var bundledAndUg = path.join(process.env.TEST_PROJECT_DIR, 'bundled_uglified.js');
          fs.writeFileSync(bundledAndUg, uglifiedBuffer);

          var code = require(bundledAndUg);
          //return code.run();
        })
        .then(function() {
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
