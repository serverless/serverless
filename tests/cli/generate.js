'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var Jaws = require('../../lib/index.js'),
    theCmd = require('../../lib/commands/generate'),
    testUtils = require('../test_utils'),
    path = require('path'),
    fs = require('fs'),
    assert = require('chai').assert;

var config = require('../config');

var resourceDir,
    projPath,
    JAWS;

describe('Test generate command', function() {

  before(function(done) {
    projPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleArnLambda,
        config.iamRoleArnApiG,
        config.envBucket);

    process.chdir(projPath);
    JAWS = new Jaws();

    resourceDir = path.join(projPath, 'back', 'lambdas', 'unittests');

    done();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Just lambda', function() {

      this.timeout(0);

      var testAction = 'lambdaOnly';

      return theCmd.generate(true, false, testAction, 'unittests')
          .then(function() {
            var jawsJson = require(resourceDir + '/' + testAction + '/jaws.json');

            assert.equal(true, !!jawsJson);
            assert.equal(true, !!jawsJson.lambda);
            assert.equal(true, !jawsJson.endpoint);
            assert.equal(true, fs.existsSync(path.join(resourceDir, testAction, 'index.js')));
            assert.equal(true, fs.existsSync(path.join(resourceDir, testAction, 'event.json')));

            testAction = 'apiOnly';
            return theCmd.generate(false, true, testAction, 'unittests');
          })
          .then(function() {
            var jawsJson = require(resourceDir + '/' + testAction + '/jaws.json');

            assert.equal(true, !!jawsJson);
            assert.equal(true, !jawsJson.lambda);
            assert.equal(true, !!jawsJson.endpoint);
            assert.equal(true, !fs.existsSync(path.join(resourceDir, testAction, 'index.js')));
            assert.equal(true, !fs.existsSync(path.join(resourceDir, testAction, 'event.json')));

            testAction = 'both';
            return theCmd.generate(true, true, testAction, 'unittests')
          })
          .then(function() {
            var jawsJson = require(resourceDir + '/' + testAction + '/jaws.json');

            assert.equal(true, !!jawsJson);
            assert.equal(true, !!jawsJson.lambda);
            assert.equal(true, !!jawsJson.endpoint);
            assert.equal(true, fs.existsSync(path.join(resourceDir, testAction, 'index.js')));
            assert.equal(true, fs.existsSync(path.join(resourceDir, testAction, 'event.json')));
          });
    });
  });
});