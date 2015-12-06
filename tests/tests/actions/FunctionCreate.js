'use strict';

/**
 * Test: Function Create Action
 * - Creates a new project in your system's temp directory
 * - Creates a new Function inside the "users" module
 */

let Serverless = require('../../../lib/Serverless.js'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    config     = require('../../config');

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

describe('Test action: Function Create', function() {

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

  describe('Function Create positive tests', function() {

    it('create a new Function inside the users Module', function(done) {
      this.timeout(0);
      let event = {
        module:   'users',
        function: 'new',
      };

      serverless.actions.functionCreate(event)
          .then(function(evt) {

            validateEvent(evt);

            let functionJson = utils.readAndParseJsonSync(path.join(serverless._projectRootPath, 'back', 'modules', 'users', 'new', 's-function.json'));
            assert.equal(true, typeof functionJson.name != 'undefined');
            assert.equal(true, typeof functionJson.envVars != 'undefined');
            assert.equal(true, typeof functionJson.package != 'undefined');
            assert.equal(true, typeof functionJson.cloudFormation != 'undefined');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
