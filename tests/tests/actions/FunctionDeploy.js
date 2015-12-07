'use strict';

/**
 * Test: Function Deploy Action
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.type != 'undefined');
  assert.equal(true, typeof evt.stage != 'undefined');
  assert.equal(true, typeof evt.regions != 'undefined');
  assert.equal(true, typeof evt.noExeCf != 'undefined');
  assert.equal(true, typeof evt.paths != 'undefined');
  assert.equal(true, typeof evt.all != 'undefined');
  assert.equal(true, typeof evt.aliasEndpoint != 'undefined');
  assert.equal(true, typeof evt.aliasFunction != 'undefined');
  assert.equal(true, typeof evt.functions != 'undefined');
};

/**
 * Create Test Project
 */

describe('Test Action: Function Deploy', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config, ['moduleone', 'moduletwo'])
        .then(projPath => {

          process.chdir(projPath);

          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
          });

          done();
        });
  });

  after(function(done) {
    done();
  });

  /**
   * Tests
   */

  describe('Function Deploy Code', function() {
    it('should deploy code', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        type:       'code',
        paths:      [
          'moduletwo/browserify',
          'moduletwo/nonoptimized',
          'moduleone/simple',
          'moduleone/multiendpoint'
        ]
      };

      serverless.actions.functionDeploy(event)
          .then(function(evt) {
            validateEvent(evt);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });


  describe('Function Deploy Endpoint', function() {

    it('should deploy endpoints', function(done) {
      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        type:       'endpoint',
        paths:      [
          'moduletwo/browserify',
          'moduletwo/nonoptimized',
          'moduleone/simple',
          'moduleone/multiendpoint'
        ]
      };

      serverless.actions.functionDeploy(event)
          .then(function(evt) {
            validateEvent(evt);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });


  //describe('Function Deploy Both', function() {
  //  it('should deploy code', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      type:       'both',
  //      paths:      [
  //        'users/create'
  //      ]
  //    };
  //
  //    serverless.actions.functionDeploy(event)
  //        .then(function(evt) {
  //          validateEvent(evt);
  //          done();
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});
  //
  //
  //describe('Function Deploy Both with "all" option.', function() {
  //  it('should deploy code', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      type:       'both',
  //      all:        true
  //    };
  //
  //    serverless.actions.functionDeploy(event)
  //        .then(function(evt) {
  //          validateEvent(evt);
  //          done();
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});


  //describe('Function deploy "both", across multiple regions', function() {
  //
  //  // Create a new region
  //  before(function(done) {
  //    this.timeout(0);
  //
  //    serverless.actions.regionCreate({
  //      stage: config.stage,
  //      region: config.region2,
  //    })
  //    .then(function() {
  //      done();
  //    })
  //    .catch(function(e) {
  //      done(e);
  //    });
  //  });
  //
  //  it('should deploy code', function(done) {
  //
  //    //this.timeout(0);
  //    //
  //    //let event = {
  //    //  stage:      config.stage,
  //    //  region:     config.region,
  //    //  type:       'code',
  //    //  paths:      [
  //    //    'users/create'
  //    //  ]
  //    //};
  //    //
  //    //serverless.actions.functionDeploy(event)
  //    //    .then(function(evt) {
  //    //      validateEvent(evt);
  //    //      done();
  //    //    })
  //    //    .catch(e => {
  //    //      done(e);
  //    //    });
  //  });
  //});
});
