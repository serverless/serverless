'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    fs = require('fs'),
    assert = require('chai').assert;

var config = require('../config');

var resourceDir;

describe('Test generate command', function() {

  before(function(done) {
    config.projectPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleARN,
        config.envBucket);

    process.chdir(config.projectPath);

    resourceDir = path.join(config.projectPath, 'back', 'lambdas', 'unittests');

    done();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Just lambda', function() {

      this.timeout(0);

      var JAWS = require('../../lib/index.js'),
          testAction = 'lambdaOnly';

      return JAWS.generate(true, false, testAction, 'unittests')
          .then(function() {
            var jawsJson = require(resourceDir + '/' + testAction + '/jaws.json');

            assert.equal(true, !!jawsJson);
            assert.equal(true, !!jawsJson.lambda);
            assert.equal(true, !jawsJson.endpoint);
            assert.equal(true, fs.existsSync(path.join(resourceDir, testAction, 'index.js')));
            assert.equal(true, fs.existsSync(path.join(resourceDir, testAction, 'event.json')));

            testAction = 'apiOnly';
            return JAWS.generate(false, true, testAction, 'unittests');
          })
          .then(function() {
            var jawsJson = require(resourceDir + '/' + testAction + '/jaws.json');

            assert.equal(true, !!jawsJson);
            assert.equal(true, !jawsJson.lambda);
            assert.equal(true, !!jawsJson.endpoint);
            assert.equal(true, !fs.existsSync(path.join(resourceDir, testAction, 'index.js')));
            assert.equal(true, !fs.existsSync(path.join(resourceDir, testAction, 'event.json')));

            testAction = 'both';
            return JAWS.generate(true, true, testAction, 'unittests')
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