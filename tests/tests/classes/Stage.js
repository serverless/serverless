'use strict';

/**
 * Test: Serverless Stage Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  path       = require('path'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless;
let instance;

describe('Test Serverless Stage Class', function() {
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
            instance = serverless.getProject().getStage(config.stage);
          });
      });
  });

  describe('Tests', function() {

    it('Get instance data, without stage properties', function() {
      let clone = instance.toObject();
      assert.equal(true, typeof clone._class === 'undefined');
      assert.equal(true, typeof clone.variables._class === 'undefined');
      assert.equal(clone.variables.stage, config.stage);
      assert.equal(clone.name, config.stage);
      assert.equal(Object.keys(clone.regions).length, 1);
    });

    it('Get regions', function() {
      let regions = instance.getAllRegions();
      assert.equal(true, regions[0].getName() === config.region);
    });

    it('Get one region', function() {
      let region = instance.getRegion(config.region);
      assert.equal(true, region.getName() === config.region);
    });

    it('hasRegion', function() {
      let hasRegion  = instance.hasRegion(config.region);
      let fakeRegion = instance.hasRegion('fakeRegion');
      assert.equal(true, hasRegion);
      assert.equal(false, fakeRegion);
    });

    it('getVariables', function() {
      let variables  = instance.getVariables();
      assert.equal(variables.stage, config.stage);
      assert.equal(true, variables._class != 'undefined');
    });

    it('addVariables', function() {
      let variables  = instance.addVariables({newVar: 'newVal'});
      assert.equal(variables.stage, config.stage);
      assert.equal(variables.newVar, 'newVal');
    });

    it('getProject', function() {
      assert.equal(instance.getProject().getName(), 's-test-prj');
    });

    it('Set instance data', function() {
      let clone = instance.toObject();
      clone.name = 'newStage';
      instance.fromObject(clone);
      assert.equal(instance.name, 'newStage');
      assert.equal(Object.keys(instance.regions).length, 1);
      assert.equal(instance.variables._class, 'Variables');
    });

    it('Save instance to the file system', function() {
      return instance.save();
    });
  });
});
