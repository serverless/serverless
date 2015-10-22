'use strict';

/**
 * Test: Deploy Lambda Action
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    Promise   = require('bluebird'),
    config    = require('../../config');

let Jaws,
    projPath;

describe('Test action: Deploy Lambda', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config, ['./'])
      .then(pp => {
        process.chdir(pp);
        projPath = pp;
        Jaws     = new JAWS({
          interactive: false,
        });
        done();
      });
  });

  after(function(done) {
    done();
  });

  describe('Deploy Lambda positive tests', function() {

    it('Multi level module deploy', function(done) {
      this.timeout(0);

      Jaws.actions.lambdaDeploy(null, null, config.noExecuteCf, './aws_modules/sessions/show')
        .then(deployedLambdas => {
          //TODO: add assertions
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('browserify deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'aws_modules/bundle/browserify'));

      Jaws.actions.lambdaDeploy(null, null, config.noExecuteCf)
        .then(deployedLambdas => {
          //TODO: add assertions
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('non optimized deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'aws_modules/bundle/nonoptimized'));

      Jaws.actions.lambdaDeploy(null, null, config.noExecuteCf)
        .then(deployedLambdas => {
          //TODO: add assertions
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('deploy multiple', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'aws_modules/bundle'));

      Jaws.actions.lambdaDeploy(null, null, config.noExecuteCf, './browserify', './nonoptimized')
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
