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

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.module != 'undefined');
  assert.equal(true, typeof evt.function != 'undefined');
  assert.equal(true, typeof evt.lambda != 'undefined');
  assert.equal(true, typeof evt.endpoint != 'undefined');
  assert.equal(true, typeof evt.runtime != 'undefined');
  assert.equal(true, typeof evt.pkgMgr != 'undefined');
};

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
        module:   'temp',
        function: 'one',
      };

      serverless.actions.moduleCreate(event)
          .then(function(evt) {

            validateEvent(evt);

            let moduleJson = utils.readAndParseJsonSync(path.join(serverless._projectRootPath, 'back', 'modules', 'temp', 'one', 's-function.json'));
            assert.equal(true, typeof moduleJson.name != 'undefined');
            assert.equal(true, typeof moduleJson.envVars != 'undefined');
            assert.equal(true, typeof moduleJson.package != 'undefined');
            assert.equal(true, typeof moduleJson.cloudFormation != 'undefined');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
