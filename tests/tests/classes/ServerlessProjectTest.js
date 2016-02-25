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

      assert.isDefined(data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].httpMethod);
      // Component template
      assert.equal(true, typeof data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].headerParams !== 'undefined');
      // Module template
      assert.equal(true, typeof data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].queryParams !== 'undefined');

      // Test subjective template inheritance
      // These functions have their own s-templates.json files which give them the same template, with one different property

      // Function1 template
      assert.equal(data.components.nodejscomponent.functions.function1.endpoints[0].requestTemplates['application/json'].pathParams, "$input.path('$.id1')");
      // Function2 template
      assert.equal(true, data.components.nodejscomponent.functions.function2.endpoints[0].requestTemplates['application/json'].pathParams === "$input.path('$.id2')");
      // Function3 template - s-templates.json left undefined
      assert.equal(true, typeof data.components.nodejscomponent.functions.function3.endpoints[0].requestTemplates['application/json'].pathParams === 'undefined');
    });

    it('Set instance data', function() {
      // console.log(22222111, instance.getVariables().toObject());
      let clone = instance.toObject();
      // console.log(22222, clone);
      clone.name = 'newProject';
      instance.fromObject(clone);
      assert.equal(true, instance.name === 'newProject');

    });

    it('Save instance to the file system', function() {
      return instance.save();
    });

    it('Get functions w/o paths', function() {
      let functions = instance.getAllFunctions();
      assert.equal(true, functions.length === 5);
    });

    it('Get function by path', function() {
      let func = instance.getFunction( 'function1' );
      assert.equal(true, func != undefined);
    });

    it.skip('Get function by partial path', function() {
      let func = instance.getFunction( 'nodejscomponent/group1/group2' );
      assert.equal(true, func != undefined);
    });

    it('Get components w/o paths', function() {
      let components = instance.getAllComponents();
      assert.equal(true, components[0].name === 'nodejscomponent');
    });

    it('Get components w paths', function() {
      let components = instance.getAllComponents({ paths: ['nodejscomponent'] });
      assert.equal(true, components[0].name === 'nodejscomponent');
    });

    it('Get events w/o paths', function() {
      let events = instance.getAllEvents();
      assert.equal(true, events.length === 4);
    });

    it('Get event by name', function() {
      let event = instance.getEvent('s3');
      assert.isDefined(event);
    });

    it('Get events w partial paths', function() {
      let events = instance.getAllEvents({ paths: ['nodejscomponent/group1'] });
      assert.equal(true, events.length === 4);
    });

    it('Get endpoints w/o paths', function() {
      let endpoints = instance.getAllEndpoints();
      assert.lengthOf(endpoints, 7);
    });

    it.skip('Get endpoints w paths', function() {
      let endpoints = instance.getAllEndpoints({ paths: ['nodejscomponent/group1/function1@group1/function1~GET'] });
      assert.equal(true, endpoints.length === 1);
    });

    it('Get endpoints by path and method', function() {
      let endpoint = instance.getEndpoint('group1/function1', 'GET');
      assert.isDefined(endpoint);
    });


    it.skip('Get endpoints w/ partial paths', function() {
      let endpoints = instance.getAllEndpoints({ paths: ['nodejscomponent/group1/group2'] });
      assert.equal(true, endpoints.length === 2);
    });

    it('Get resources (unpopulated)', function() {
      let resources = instance.getResources().toObject()
      assert.equal(true, JSON.stringify(resources).indexOf('${') !== -1);
      assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket1') !== -1);
      assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket2') !== -1); // TODO: Back compat support.  Remove V1
    });

    it('Get resources (populated)', function() {
      let resources = instance.getResources().toObjectPopulated({populate: true, stage: config.stage, region: config.region})
      assert.equal(true, JSON.stringify(resources).indexOf('$${') == -1);
      assert.equal(true, JSON.stringify(resources).indexOf('${') == -1);
      assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket1') !== -1);
      assert.equal(true, JSON.stringify(resources).indexOf('fake_bucket2') !== -1); // TODO: Back compat support.  Remove V1
    });

    it('Validate region exists', function() {
      assert.equal(true, instance.validateRegionExists(config.stage, config.region));
      assert.equal(false, instance.validateRegionExists(config.stage, 'invalid'));
    });

    it('Validate stage exists', function() {
      assert.equal(true, instance.validateStageExists(config.stage));
      assert.equal(false, instance.validateStageExists('invalid'));
    });

    it('Get regions', function() {
      let regions = instance.getAllRegions(config.stage);
      assert.equal(true, regions[0].getName() === config.region);
    });

    it('Get stages', function() {
      let stages = instance.getStages();
      assert.equal(true, stages[0] === config.stage);
    });

    it('Create new and save', function() {
      // TODO: Project creation is an unholy mess now. It currently is done partially outside of Project class,
      // split between ServerlessState and Meta classes, ProjectInit action, and Project itself.
      // So, either the code should be moved fully to Project and be tested here (preferred)
      // or not really tested here. To make this happen we should first remove ServerlessState and ServerlessMeta
      // classes completely.
      let project = new serverless.classes.Project(serverless);

      return project.save()
        .then(function(instance) {
          return project.load();
        });
    });
  });
});
