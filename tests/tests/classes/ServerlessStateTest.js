'use strict';

/**
 * Test: Serverless State Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  Project     = require('../../../lib/ServerlessProject'),
  path         = require('path'),
  utils        = require('../../../lib/utils/index'),
  assert       = require('chai').assert,
  testUtils    = require('../../test_utils'),
  config       = require('../../config');

let serverless;
let instance;

describe('Test Serverless State Class', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projPath => {

        process.chdir(projPath);

        // Instantiate Serverless
        serverless = new Serverless( projPath, {
          interactive: false
        });

        return serverless.init()
          .then(function() {

            // Instantiate Class
            instance = new serverless.classes.State(serverless);

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

    it('Set instance data', function(done) {
      let clone = instance.get();
      clone.project.name = 'newProject';
      instance.set(clone);
      assert.equal(true, instance._S.getProject().name === 'newProject');
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

    it('Get meta', function(done) {
      let meta = instance.getMeta();
      assert.equal(true, typeof meta.variables !== 'undefined');
      done();
    });

    it('Set Assets', function(done) {

      //TODO
      //let project   = new instance._S.classes.Project(".");
      //project.name  = 'testProject';
      //instance.setAsset(project);

      //let component  = new instance._S.classes.Component(instance._S, { sPath: 'testComponent' });
      //component.name = 'testComponent';
      //instance.setAsset(component);
      //
      //let func   = new instance._S.classes.Function(instance._S, { sPath: 'testComponent/group1/testFunction' });
      //func.name  = 'testFunction';
      //instance.setAsset(func);
      //
      //let endpoint   = new instance._S.classes.Endpoint(instance._S, { sPath: 'testComponent/group1/testFunction@group1/testFunction~GET' });
      //endpoint.path  = 'test/endpoint';
      //instance.setAsset(endpoint);

      // TODO
      //assert.equal(true, instance._S.getProject().name === 'testProject');
      //assert.equal(true, typeof instance.project.components[component.name] !== 'undefined');
      //assert.equal(true, typeof instance.project.components[component.name].functions[func._config.sPath] !== 'undefined');
      //assert.equal(true, instance.project.components[component.name].functions[func._config.sPath].endpoints.length > 0);

      done();
    });
  });
});
