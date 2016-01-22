'use strict';

/**
 * Test: Serverless Endpoint Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  path       = require('path'),
  utils      = require('../../../lib/utils/index'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless, instance, projPath;

describe('Test Serverless Endpoint Class', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(function(prjPath) {

        projPath = prjPath;
        process.chdir(projPath);

        // Instantiate Serverless
        serverless = new Serverless({
          interactive: false,
          projectPath: projPath
        });

        return serverless.init()
          .then(function() {

            // Instantiate Class
            instance = new serverless.classes.Endpoint(serverless, {
              component: 'nodejscomponent',
              module: 'module1',
              function: 'function1',
              endpointPath: 'module1/function1',
              endpointMethod: 'GET'
            });

            done();
          });
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
      clone.method = 'POST';
      instance.set(clone);
      assert.equal(true, instance.method === 'POST');
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
      let endpoint = new serverless.classes.Endpoint(serverless, {
        component: 'nodejscomponent',
        module: 'module1',
        function: 'function1',
        endpointPath: 'test',
        endpointMethod: 'GET'
      });

      endpoint.save()
        .then(function(instance) {
          return endpoint.load()
            .then(function(instance) {
              done();
            });
        })
        .catch(e => {
          done(e);
        });
    });

    it('Get function', function() {
      let func = instance.getFunction();
      assert.instanceOf(func, serverless.classes.Function);
      assert.equal(func.name, instance._config.function);
    });
  });
});
