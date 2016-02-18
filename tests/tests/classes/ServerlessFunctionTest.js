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
        serverless = new Serverless( projPath, {
          interactive: false
        });

        return serverless.init()
          .then(function() {

            // Instantiate Class
            instance = new serverless.classes.Function(serverless, serverless.getProject().getComponent('nodejscomponent'), {
              sPath: 'nodejscomponent/group1/function1'
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
      let data = instance.toObjectPopulated({ stage: config.stage, region: config.region });
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
      done();
    });

    it('Get deployed name', function(done) {
      instance.customName = "${stage}-func";
      let data = instance.getDeployedName({ stage: config.stage, region: config.region });
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
      assert.equal(true, data === config.stage + '-func');
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
      let func = new serverless.classes.Function(serverless, serverless.getProject().getComponent('nodejscomponent'), {
        sPath: 'nodejscomponent/group1/function1'
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
  });
});
