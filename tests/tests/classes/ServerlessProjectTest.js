'use strict';

/**
 * Test: Serverless Project Class
 */

let Serverless = require('../../../lib/Serverless.js'),
  SPlugin    = require('../../../lib/ServerlessPlugin'),
  path       = require('path'),
  utils      = require('../../../lib/utils/index'),
  assert     = require('chai').assert,
  testUtils  = require('../../test_utils'),
  config     = require('../../config');

let serverless;
let instance;

describe('Test Serverless Project Class', function() {

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
            instance = serverless.getProject();

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
      console.log("here", JSON.stringify(data))
      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
      // We've set a template in the project that gets extended at the module level and function level, check it:
      // Project template
      assert.equal(true, typeof data.components.nodejscomponent.functions['nodejscomponent/group1/function1'].endpoints[0].requestTemplates['application/json'].httpMethod !== 'undefined');
      // Component template
      assert.equal(true, typeof data.components.nodejscomponent.functions['nodejscomponent/group1/function1'].endpoints[0].requestTemplates['application/json'].headerParams !== 'undefined');
      // Module template
      assert.equal(true, typeof data.components.nodejscomponent.functions['nodejscomponent/group1/function1'].endpoints[0].requestTemplates['application/json'].queryParams !== 'undefined');

      // Test subjective template inheritance
      // These functions have their own s-templates.json files which give them the same template, with one different property

      // Function1 template
      assert.equal(true, data.components.nodejscomponent.functions['nodejscomponent/group1/function1'].endpoints[0].requestTemplates['application/json'].pathParams === "$input.path('$.id1')");
      // Function2 template
      assert.equal(true, data.components.nodejscomponent.functions['nodejscomponent/group1/function2'].endpoints[0].requestTemplates['application/json'].pathParams === "$input.path('$.id2')");
      // Function3 template - s-templates.json left undefined
      assert.equal(true, typeof data.components.nodejscomponent.functions['nodejscomponent/group1/function3'].endpoints[0].requestTemplates['application/json'].pathParams === 'undefined');

      done();
    });

    it('Set instance data', function(done) {
      let clone = instance.get();
      clone.name = 'newProject';
      instance.set(clone);
      assert.equal(true, instance.name === 'newProject');
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
      // TODO: Project creation is an unholy mess now. It currently is done partially outside of Project class,
      // split between ServerlessState and Meta classes, ProjectInit action, and ServerlessProject itself.
      // So, either the code should be moved fully to Project and be tested here (preferred)
      // or not really tested here. To make this happen we should first remove ServerlessState and ServerlessMeta
      // classes completely.
      let project = new serverless.classes.Project(serverless.getProject().getRootPath());
      project.setServerless( serverless );

      project.save()
        .then(function(instance) {
          return project.load()
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
