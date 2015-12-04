'use strict';

/**
 * Test: Deploy Lambda Action
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    Promise   = require('bluebird'),
    config    = require('../../config');

let serverless,
    projPath;

describe('Test action: Deploy Lambda', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config, ['./'])
      .then(pp => {
        process.chdir(pp);
        projPath = pp;
        serverless     = new Serverless({
          interactive: false,
        });
        done();
      });
  });

  after(function(done) {
    done();
  });

  describe('Deploy Lambda positive tests', function() {

    it('Multi level module queued', function(done) {
      this.timeout(0);

      serverless.actions.lambdaDeploy(null, null, config.noExecuteCf, './modules/sessions/show')
        .then(deployedLambdas => {
          //TODO: add assertions
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('browserify queued', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'modules/bundle/browserify'));

      serverless.actions.lambdaDeploy(null, null, config.noExecuteCf)
        .then(deployedLambdas => {
          //TODO: add assertions
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('non optimized queued', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'modules/bundle/nonoptimized'));

      serverless.actions.lambdaDeploy(null, null, config.noExecuteCf)
        .then(deployedLambdas => {
          //TODO: add assertions
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('queued multiple', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'modules/bundle'));

      serverless.actions.lambdaDeploy(null, null, config.noExecuteCf, './browserify', './nonoptimized')
        .then(deployedLambdas => {
          //TODO: add assertions
          done();
        })
        .catch(e => {
          done(e);
        });
    });

  });
});
