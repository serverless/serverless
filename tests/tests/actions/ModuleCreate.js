'use strict';

/**
 * Test: Module Create Action
 * - Creates a new project in your system's temp directory
 * - Deletes the CF stack created by the project
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let Jaws;

describe('Test action: Module Create', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projPath => {
        process.chdir(projPath);
        Jaws = new JAWS({
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

      Jaws.actions.moduleCreate(event)
        .then(function() {
          let awsmJson = utils.readAndParseJsonSync(path.join(Jaws._projectRootPath, 'aws_modules', 'users', 'list', 'lambda.awsm.json'));
          //TODO: add introspections for attrs that should be set)
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
