'use strict';

/**
 * Test: Module Create Action
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let serverless;

describe('Test action: Module Create', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projPath => {
        process.chdir(projPath);
        serverless = new Serverless({
          interactive: false,
        });
        done();
      });
  });

  after(function(done) {
    done();
  });

  describe('Module Create positive tests', function() {

    it('create a new module with defaults', function(done) {
      this.timeout(0);
      let event = {
        resource: 'users',
        action:   'list',
      };

      serverless.actions.moduleCreate(event)
        .then(function() {
          let awsmJson = utils.readAndParseJsonSync(path.join(serverless._projectRootPath, 'modules', 'users', 'list', 's-function.json'));
          //TODO: add introspections for attrs that should be set)
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
