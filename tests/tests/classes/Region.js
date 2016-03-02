'use strict';

/**
 * Test: Serverless Region Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  path         = require('path'),
  assert       = require('chai').assert,
  testUtils    = require('../../test_utils'),
  config       = require('../../config');

let serverless;
let instance;

describe('Test Serverless Region Class', function() {
  this.timeout(0);

  before(function() {
    return testUtils.createTestProject(config)
      .then(projectPath => {
        process.chdir(projectPath);

        serverless = new Serverless({
          projectPath,
          interactive: false
        });

        return serverless.init()
          .then(function() {
            instance = serverless.getProject().getRegion(config.stage, config.region);
          });
      });
  });

  describe('Tests', function() {

    it('Get instance data, without region properties', function() {
      let clone = instance.toObject();
      assert.equal(true, typeof clone._class === 'undefined');
      assert.equal(true, typeof clone.variables._class === 'undefined');
      assert.equal(clone.name, config.region);
      assert.equal(clone.variables.region, config.region);
    });

    it('getVariables', function() {
      let variables  = instance.getVariables();
      assert.equal(variables.region, config.region);
      assert.equal(true, variables._class != 'undefined');
    });

    it('addVariables', function() {
      let variables  = instance.addVariables({newVar: 'newVal'});
      assert.equal(variables.region, config.region);
      assert.equal(variables.newVar, 'newVal');
    });

    it('getProject', function() {
      assert.equal(instance.getProject().getName(), 's-test-prj');
    });

    it('Get stage', function() {
      assert.equal(instance.getStage().getName(), config.stage);
    });

    it('Set instance data', function() {
      let clone = instance.toObject();
      clone.name = 'us-west-2';
      instance.fromObject(clone);
      assert.equal(instance.name, 'us-west-2');
      assert.equal(instance.variables._class, 'Variables');
    });

    it('Save instance to the file system', function() {
      return instance.save();
    });
  });
});
