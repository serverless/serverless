'use strict';

/**
 * Test: Serverless Function Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  path       = require('path'),
  utils      = require('../../../lib/utils/index'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless;
let instance;

describe('Test Serverless Function Class', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projPath => {

        process.chdir(projPath);

        // Instantiate Serverless
        serverless = new Serverless({
          interactive: false,
          projectPath: projPath
        });

        // Instantiate Class
        instance = new serverless.classes.Function(serverless, {
          component: 'nodejscomponent',
          module:    'module1',
          function:  'function1'
        });

        done();
      });
  });

  after(function(done) {
    done();
  });

  describe('Tests', function() {

    it('Load instance from file system', function(done) {
      instance.load()
        .then(function(instance) {
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('Get instance data, without private properties', function(done) {
      let clone = instance.get();
      assert.equal(true, typeof clone._config === 'undefined');
      done();
    });

    it('Get populated instance data', function(done) {
      let data = instance.getPopulated({ stage: config.stage, region: config.region });
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
      done();
    });

    it('Set instance data', function(done) {
      let clone = instance.get();
      clone.name = 'newFunction';
      instance.set(clone);
      assert.equal(true, instance.name === 'newFunction');
      done();
    });

    it('Save instance to the file system', function(done) {
      instance.save()
        .then(function(instance) {
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('Create new and save', function(done) {
      let func = new serverless.classes.Function(serverless, {
        component: 'nodejscomponent',
        module: 'module1',
        function: 'function4'
      });

      func.save()
        .then(function(instance) {
          return func.load()
            .then(function() {
              done();
            });
        })
        .catch(e => {
          done(e);
        });
    });

    it('Get module', function() {
      let module = instance.getModule();
      assert.instanceOf(module, serverless.classes.Module);
      assert.equal(module.name, instance._config.module);
    });
  });
});
