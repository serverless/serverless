'use strict';

/**
 * Test: Function Create Action
 * - Creates a new private in your system's temp directory
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
  assert.equal(true, typeof evt.options.component != 'undefined');
  assert.equal(true, typeof evt.options.module != 'undefined');
  assert.equal(true, typeof evt.options.function != 'undefined');
};

describe('Test action: Function Create', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {
          process.chdir(projPath);
          serverless = new Serverless({
            interactive: false,
            projectPath: projPath
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
      let evt = {
        options: {
          component: 'nodejscomponent'
          module:    'module1',
          function:  'new'
        }
      };

      serverless.actions.functionCreate(evt)
          .then(function(evt) {
            validateEvent(evt);
            let functionJson = utils.readAndParseJsonSync(path.join(serverless.config.projectPath, 'nodejscomponent', 'module1', 'function1', 's-function.json'));
            assert.equal(true, typeof functionJson.name != 'undefined');
            assert.equal(true, functionJson.endpoints.length);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
