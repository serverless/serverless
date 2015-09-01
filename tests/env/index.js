'use strict';

var JawsError = require('../../lib/jaws-error'),
    path = require('path'),
    fs = require('fs'),
    assert = require('chai').assert,
    JAWS = null;

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'mystage',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

describe('env command', function() {
  before(function(done) {
    this.timeout(0);

    process.chdir('/Users/ryanpendergast/projects/JAWS/tests/bundle/testapp');

    JAWS = require('../../lib/index.js');

    done();
  });

  it('list', function(done) {
    this.timeout(0);

    JAWS.listEnv(stage)
        .then(function(d) {
          done();
        })
        .error(function(e) {
          done(e);
        });
  });
});
