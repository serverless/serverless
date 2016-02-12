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
        serverless = new Serverless( projPath, {
          interactive: false
        });

        return serverless.init()
          .then(function() {

            // Instantiate Class
            instance = new serverless.classes.Endpoint(serverless, serverless.getProject().getFunction( 'nodejscomponent/group1/function1' ), {
              component: 'nodejscomponent',
              module: 'group1',
              function: 'function1',
              endpointPath: 'group1/function1',
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

    it('Get function', function() {
      let func = instance.getFunction();
      assert.instanceOf(func, serverless.classes.Function);
      assert.equal(true, instance._config.sPath.indexOf(func._config.sPath) !== -1)
    });

    it('Get component', function() {
      let comp = instance.getComponent();
      assert.instanceOf(comp, serverless.classes.Component);
      assert.equal(true, instance._config.sPath.indexOf(comp._config.sPath) !== -1)
    });
  });
});
