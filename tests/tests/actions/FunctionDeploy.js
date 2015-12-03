'use strict';

/**
 * Test: Function Deploy Action
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let Jaws;

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
  assert.equal(true, typeof evt.endpointAlias != 'undefined');
  assert.equal(true, typeof evt.functions != 'undefined');
};

/**
 * Create Test Project
 */

describe('Test Action: Function Deploy', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {

          process.chdir(projPath);

          Jaws = new JAWS({
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
        noExeCf:    config.noExecuteCf,
        type:       'code',
        paths:      [
          'users/create'
        ]
      };

      Jaws.actions.functionDeploy(event)
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
        noExeCf:    config.noExecuteCf,
        type:       'endpoint',
        paths:      [
          'users/create'
        ]
      };

      Jaws.actions.functionDeploy(event)
          .then(function(evt) {
            validateEvent(evt);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });


  describe('Function Deploy Both', function() {
    it('should deploy code', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        noExeCf:    config.noExecuteCf,
        type:       'both',
        paths:      [
          'users/create'
        ]
      };

      Jaws.actions.functionDeploy(event)
          .then(function(evt) {
            validateEvent(evt);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });


  describe('Function Deploy Both with "all" option.', function() {
    it('should deploy code', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        noExeCf:    config.noExecuteCf,
        type:       'both',
        all:        true
      };

      Jaws.actions.functionDeploy(event)
          .then(function(evt) {
            validateEvent(evt);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });


  //describe('Function Deploy Both across multiple regions', function() {
  //
  //  // Create a new region
  //  before(function(done) {
  //    this.timeout(0);
  //
  //    Jaws.actions.regionCreate();
  //
  //  });
  //
  //
  //  it('should deploy code', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      noExeCf:    config.noExecuteCf,
  //      type:       'code',
  //      paths:      [
  //        'users/create'
  //      ]
  //    };
  //
  //    Jaws.actions.functionDeploy(event)
  //        .then(function(evt) {
  //          validateEvent(evt);
  //          done();
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});
});
