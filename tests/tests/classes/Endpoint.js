'use strict';

/**
 * Test: Serverless Endpoint Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  path       = require('path'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless, instance, projPath;

describe('Test Serverless Endpoint Class', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projectPath => {

        process.chdir(projectPath);

        // Instantiate Serverless
        serverless = new Serverless({
          projectPath,
          interactive: false
        });

        return serverless.init()
          .then(function() {

            instance = serverless.getProject().getEndpoint('group1/function1~GET');

            done();
          });
      });
  });

  after(function(done) {
    done();
  });

  describe('Tests', function() {

    it('Get instance data, without project properties', function() {
      let clone = instance.toObject();
      assert.equal(true, typeof clone._class === 'undefined');
      assert.equal(true, typeof clone._filePath === 'undefined');
      assert.equal(clone.path, 'group1/function1');
      assert.equal(clone.method, 'GET');
      assert.equal(true, JSON.stringify(clone).indexOf('$${') != -1);
    });

    it('Get populated instance data', function() {
      let data = instance.toObjectPopulated({ stage: config.stage, region: config.region });
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
    });

    it('getProject', function() {
      assert.equal(instance.getProject().name, 's-test-prj');
    });

    it('getFunction', function() {
      assert.equal(instance.getFunction()._class, 'Function');
      assert.equal(instance.getFunction().name, 'function1');
    });

    it('getTemplates', function() {
      assert.equal(instance.getTemplates()._class, 'Templates');
      assert.equal(instance.getTemplates()._parents.length, 2);
    });

    it('Set instance data', function() {
      let clone = instance.toObject();
      clone.path = 'new/path';
      instance.fromObject(clone);
      assert.equal(true, instance.path === 'new/path');
    });
  });
});
