'use strict';

/**
 * Test: Serverless State Class
 */

let Serverless = require('../../../lib/Serverless.js'),
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
        serverless = new Serverless({
          interactive: false,
          projectPath: projPath
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

    //it('Get populated instance data', function(done) {
    //  let data = instance.getPopulated({ stage: config.stage, region: config.region });
    //  assert.equal(true, JSON.stringify(data).indexOf('$${') == -1);
    //  assert.equal(true, JSON.stringify(data).indexOf('${') == -1);
    //  done();
    //});

    it('Set instance data', function(done) {
      let clone = instance.get();
      clone.project.name = 'newProject';
      instance.set(clone);
      assert.equal(true, instance.project.name === 'newProject');
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

    it('Get project', function(done) {
      let project = instance.getProject();
      assert.equal(true, project.name === 'newProject');
      done();
    });

    it('Get meta', function(done) {
      let meta = instance.getMeta();
      assert.equal(true, typeof meta.variables !== 'undefined');
      done();
    });

    it('Get resources (unpopulated)', function(done) {
      instance.getResources()
        .then(function(resources) {
          assert.equal(true, JSON.stringify(resources).indexOf('${') !== -1);
          console.log(JSON.stringify(resources))
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

    it('Get stages', function(done) {
      let stages = instance.getStages();
      assert.equal(true, stages[0] === config.stage);
      done();
    });

    it('Get regions', function(done) {
      let regions = instance.getRegions(config.stage);
      assert.equal(true, regions[0] === config.region);
      done();
    });

    it('Get components w/o paths', function(done) {
      let components = instance.getComponents();
      assert.equal(true, components[0].name === 'nodejscomponent');
      done();
    });

    it('Get components w paths', function(done) {
      let components = instance.getComponents({ paths: ['nodejscomponent'] });
      assert.equal(true, components[0].name === 'nodejscomponent');
      done();
    });

    it('Get components by component', function(done) {
      let components = instance.getComponents({ component: 'nodejscomponent' });
      assert.equal(true, components[0].name === 'nodejscomponent');
      done();
    });

    it('Get functions w/o paths', function(done) {
      let functions = instance.getFunctions();
      assert.equal(true, functions.length === 5);
      done();
    });

    it('Get functions w paths', function(done) {
      let functions = instance.getFunctions({ paths: ['nodejscomponent/group1/function1'] });
      assert.equal(true, functions.length === 1);
      done();
    });

    it('Get functions w/ partial paths', function(done) {
      let functions = instance.getFunctions({ paths: ['nodejscomponent/group1/group2'] });
      assert.equal(true, functions.length === 1);
      done();
    });

    it('Get functions by component, module and function', function(done) {
      let functions = instance.getFunctions({
        component: 'nodejscomponent',
        module: 'group1',
        function: 'function1' });
      assert.equal(true, functions.length === 1);
      done();
    });

    it('Get endpoints w/o paths', function(done) {
      let endpoints = instance.getEndpoints();
      assert.equal(true, endpoints.length === 7);
      done();
    });

    it('Get endpoints w paths', function(done) {
      let endpoints = instance.getEndpoints({ paths: ['nodejscomponent/group1/function1@group1/function1~GET'] });
      assert.equal(true, endpoints.length === 1);
      done();
    });

    it('Get endpoints w/ partial paths', function(done) {
      let endpoints = instance.getEndpoints({ paths: ['nodejscomponent/group1/group2'] });
      assert.equal(true, endpoints.length === 2);
      done();
    });

    it('Get endpoints by component, module, function, path and method', function(done) {
      let endpoints = instance.getEndpoints({ component: 'nodejscomponent', module: 'group1', function: 'function3', endpointPath: 'group1/function3', endpointMethod: 'POST' });
      assert.equal(true, endpoints.length === 1);
      done();
    });

    it('Get endpoints by component, module and function', function(done) {
      let endpoints = instance.getEndpoints({ component: 'nodejscomponent', module: 'group1', function: 'function1' });
      assert.equal(true, endpoints.length === 1);
      done();
    });

    it('Get endpoints by method', function(done) {
      let endpoints = instance.getEndpoints({ paths: ['nodejscomponent/group1'], endpointMethod: 'GET' });
      assert.equal(true, endpoints.length === 4);
      done();
    });

    // asfasf
    it('Get events w/o paths', function(done) {
      let events = instance.getEvents();
      assert.equal(true, events.length === 4);
      done();
    });

    it('Get events w paths', function(done) {
      let events = instance.getEvents({ paths: ['nodejscomponent/group1/function1#s3'] });
      assert.equal(true, events.length === 1);
      done();
    });

    it('Get events w partial paths', function(done) {
      let events = instance.getEvents({ paths: ['nodejscomponent/group1'] });
      assert.equal(true, events.length === 4);
      done();
    });

    it('Validate stage exists', function(done) {
      assert.equal(true, instance.validateStageExists(config.stage));
      assert.equal(false, instance.validateStageExists('invalid'));
      done();
    });

    it('Validate region exists', function(done) {
      assert.equal(true, instance.validateRegionExists(config.stage, config.region));
      assert.equal(false, instance.validateRegionExists(config.stage, 'invalid'));
      done();
    });

    it('Set Assets', function(done) {

      let project   = new instance._S.classes.Project(instance._S);
      project.name  = 'testProject';
      instance.setAsset(project);

      let component  = new instance._S.classes.Component(instance._S, { sPath: 'testComponent' });
      component.name = 'testComponent';
      instance.setAsset(component);

      let func   = new instance._S.classes.Function(instance._S, { sPath: 'testComponent/group1/testFunction' });
      func.name  = 'testFunction';
      instance.setAsset(func);

      let endpoint   = new instance._S.classes.Endpoint(instance._S, { sPath: 'testComponent/group1/testFunction@group1/testFunction~GET' });
      endpoint.path  = 'test/endpoint';
      instance.setAsset(endpoint);

      assert.equal(true, instance.project.name === 'testProject');
      assert.equal(true, typeof instance.project.components[component.name] !== 'undefined');
      assert.equal(true, typeof instance.project.components[component.name].functions[func._config.sPath] !== 'undefined');
      assert.equal(true, instance.project.components[component.name].functions[func._config.sPath].endpoints.length > 0);

      done();
    });
  });
});
