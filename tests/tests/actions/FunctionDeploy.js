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

  //describe('Function Deploy - Code: Lambda, Nodejs', function() {
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
  //        'bundle/browserify',
  //        'bundle/nonoptimized',
  //        'multiple/endpoints',
  //        'users/show',
  //        'users/create'
  //      ]
  //    };
  //
  //    Jaws.actions.functionDeploy(event)
  //        .then(function() {
  //          done();
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});

  //describe('Function Deploy - Endpoint: ApiGateway', function() {
  //
  //  it('should deploy endpoints', function(done) {
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      noExeCf:    config.noExecuteCf,
  //      type:       'endpoint',
  //      paths:      [
  //        'bundle/browserify',
  //        'bundle/nonoptimized',
  //        'multiple/endpoints',
  //        'users/show',
  //        'users/create'
  //      ]
  //    };
  //
  //    Jaws.actions.functionDeploy(event)
  //        .then(function() {
  //          done();
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});

  //describe('Function Deploy - All: With selected paths', function() {
  //  it('should deploy code', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      region:     config.region,
  //      noExeCf:    config.noExecuteCf,
  //      type:       'all',
  //      paths:      [
  //        'bundle/browserify',
  //        'bundle/nonoptimized',
  //        'multiple/endpoints',
  //        'users/show',
  //        'users/create'
  //      ]
  //    };
  //
  //    Jaws.actions.functionDeploy(event)
  //        .then(function() {
  //          done();
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});

  describe('Function Deploy - All: With "all" option.', function() {
    it('should deploy code', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        noExeCf:    config.noExecuteCf,
        type:       'all',
        all:        true
      };

      Jaws.actions.functionDeploy(event)
          .then(function() {
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

  //describe('Function Deploy - All: Multi-Region deployment, with "all" option.', function() {
  //  it('should deploy code', function(done) {
  //
  //    this.timeout(0);
  //
  //    let event = {
  //      stage:      config.stage,
  //      noExeCf:    config.noExecuteCf,
  //      type:       'all',
  //      all:        true
  //    };
  //
  //    Jaws.actions.functionDeploy(event)
  //        .then(function() {
  //          done();
  //        })
  //        .catch(e => {
  //          done(e);
  //        });
  //  });
  //});
});
