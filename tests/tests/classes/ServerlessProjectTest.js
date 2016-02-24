'use strict';

/**
 * Test: Serverless Project Class
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

describe('Test Serverless Project Class', function() {
  this.timeout(0);

  before(function() {
    return testUtils.createTestProject(config)
      .then(projectPath => {
        process.chdir(projectPath);

        // Instantiate Serverless
        serverless = new Serverless({
          projectPath,
          interactive: false
        });

        return serverless.init()
          .then(function() {
            // Instantiate Class
            instance = serverless.getProject();
          });
      });
  });

  describe('Tests', function() {

    it.skip('Load instance from file system', function() {
      return instance.load();
    });

    it('Get instance data, without private properties', function() {
      let clone = instance.toObject();
      assert.equal(true, typeof clone._config === 'undefined');
    });

    it('Get populated instance data', function() {
      let data = instance.toObjectPopulated({ stage: config.stage, region: config.region });

      assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
      // We've set a template in the project that gets extended at the module level and function level, check it:
      // Project template
      assert.equal(true, typeof data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].httpMethod !== 'undefined');
      // Component template
      assert.equal(true, typeof data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].headerParams !== 'undefined');
      // Module template
      assert.equal(true, typeof data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].queryParams !== 'undefined');

      // Test subjective template inheritance
      // These functions have their own s-templates.json files which give them the same template, with one different property

      // Function1 template
      assert.equal(data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].pathParams, "$input.path('$.id1')");
      // Function2 template
      assert.equal(true, data.components.nodejscomponent.functions['nodejscomponent/group1/function2'].endpoints[0].requestTemplates['application/json'].pathParams === "$input.path('$.id2')");
      // Function3 template - s-templates.json left undefined
      assert.equal(true, typeof data.components.nodejscomponent.functions['nodejscomponent/group1/function3'].endpoints[0].requestTemplates['application/json'].pathParams === 'undefined');
    });

    it('Set instance data', function() {
      let clone = instance.get();
      clone.name = 'newProject';
      instance.set(clone);
      assert.equal(true, instance.name === 'newProject');
    });

    it('Save instance to the file system', function() {
      return instance.save();
    });

    it('Get functions w/o paths', function(done) {
      let functions = instance.getAllFunctions();
      assert.equal(true, functions.length === 5);
      done();
    });

    it('Get function by path', function(done) {
      let func = instance.getFunction( 'nodejscomponent/group1/function1' );
      assert.equal(true, func != undefined);
      done();
    });

    it('Get function by partial path', function(done) {
      let func = instance.getFunction( 'nodejscomponent/group1/group2' );
      assert.equal(true, func != undefined);
      done();
    });

    it('Get components w/o paths', function(done) {
      let components = instance.getAllComponents();
      assert.equal(true, components[0].name === 'nodejscomponent');
      done();
    });

    it('Get components w paths', function(done) {
      let components = instance.getAllComponents({ paths: ['nodejscomponent'] });
      assert.equal(true, components[0].name === 'nodejscomponent');
      done();
    });

    it('Get events w/o paths', function(done) {
      let events = instance.getAllEvents();
      assert.equal(true, events.length === 4);
      done();
    });

    it('Get events w paths', function(done) {
      let events = instance.getAllEvents({ paths: ['nodejscomponent/group1/function1#s3'] });
      assert.equal(true, events.length === 1);
      done();
    });

    it('Get events w partial paths', function(done) {
      let events = instance.getAllEvents({ paths: ['nodejscomponent/group1'] });
      assert.equal(true, events.length === 4);
      done();
    });

    it('Get endpoints w/o paths', function(done) {
      let endpoints = instance.getAllEndpoints();
      assert.equal(true, endpoints.length === 7);
      done();
    });

    it('Get endpoints w paths', function(done) {
      let endpoints = instance.getAllEndpoints({ paths: ['nodejscomponent/group1/function1@group1/function1~GET'] });
      assert.equal(true, endpoints.length === 1);
      done();
    });

    it('Get endpoints w/ partial paths', function(done) {
      let endpoints = instance.getAllEndpoints({ paths: ['nodejscomponent/group1/group2'] });
      assert.equal(true, endpoints.length === 2);
      done();
    });

    it('Get resources (unpopulated)', function(done) {
      instance.getResources()
        .then(function(resources) {
          assert.equal(true, JSON.stringify(resources).indexOf('${') !== -1);
          assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket1') !== -1);
          assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket2') !== -1); // TODO: Back compat support.  Remove V1
          done();
        });
    });

    it('Get resources (populated)', function(done) {
      instance.getResources({
          populate: true, stage: config.stage, region: config.region
        })
        .then(function(resources) {
          assert.equal(true, JSON.stringify(resources).indexOf('$${') == -1);
          assert.equal(true, JSON.stringify(resources).indexOf('${') == -1);
          assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket1') !== -1);
          assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket2') !== -1); // TODO: Back compat support.  Remove V1
          done();
        });
    });

    it('Validate region exists', function(done) {
      assert.equal(true, instance.validateRegionExists(config.stage, config.region));
      assert.equal(false, instance.validateRegionExists(config.stage, 'invalid'));
      done();
    });

    it('Validate stage exists', function(done) {
      assert.equal(true, instance.validateStageExists(config.stage));
      assert.equal(false, instance.validateStageExists('invalid'));
      done();
    });

    it('Get regions', function(done) {
      let regions = instance.getAllRegions(config.stage);
      assert.equal(true, regions[0] === config.region);
      done();
    });

    it('Get stages', function(done) {
      let stages = instance.getStages();
      assert.equal(true, stages[0] === config.stage);
      done();
    });

    it('Create new and save', function(done) {
      // TODO: Project creation is an unholy mess now. It currently is done partially outside of Project class,
      // split between ServerlessState and Meta classes, ProjectInit action, and Project itself.
      // So, either the code should be moved fully to Project and be tested here (preferred)
      // or not really tested here. To make this happen we should first remove ServerlessState and ServerlessMeta
      // classes completely.
      let project = new serverless.classes.Project(serverless.getProject().getFilePath(), serverless);

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
