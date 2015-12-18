'use strict';

/**
 * Test: Module Create Action
 * - Creates a new project in your system's temp directory
 * - Creates a new Module inside test project
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
  assert.equal(true, typeof evt.runtime != 'undefined');
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
            let functionJson = utils.readAndParseJsonSync(path.join(serverless._projectRootPath, 'back', 'modules', 'temp', 'one', 's-function.json'));
            assert.equal(true, typeof functionJson.functions.one != 'undefined');
            assert.equal(true, functionJson.functions.one.endpoints.length);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
