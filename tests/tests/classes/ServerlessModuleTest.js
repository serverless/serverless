'use strict';

/**
 * Test: Serverless Module Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  SPlugin    = require('../../../lib/Plugin'),
  path       = require('path'),
  utils      = require('../../../lib/utils/index'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless;
let instance;

describe('Test Serverless Module Class', function() {

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

        return serverless.init()
          .then(function() {

            // Instantiate Class
            instance = new serverless.classes.Module(serverless, {
              component: 'nodejscomponent',
              module: 'group1'
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
      let data = instance.toObjectPopulated({ stage: config.stage, region: config.region })
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
      done();
    });

    it('Set instance data', function(done) {
      let clone = instance.get();
      clone.name = 'newModule';
      instance.set(clone);
      assert.equal(true, instance.name === 'newModule');
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
      let module = new serverless.classes.Module(serverless, {
        component: 'nodejscomponent',
        module: 'group1'
      });

      module.save()
        .then(function(instance) {
          return module.load()
            .then(function() {
              done();
            });
        })
        .catch(e => {
          done(e);
        });
    });

    it('Get component', function() {
      let component = instance.getComponent();
      assert.instanceOf(component, serverless.classes.Component);
      assert.equal(component.name, instance._config.component);
    });
  });
});
