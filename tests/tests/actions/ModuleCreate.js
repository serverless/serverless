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
  assert.equal(true, typeof evt.options.component != 'undefined');
  assert.equal(true, typeof evt.options.module != 'undefined');
  assert.equal(true, typeof evt.options.function != 'undefined');
  assert.equal(true, typeof evt.options.runtime != 'undefined');
};

describe('Test action: Module Create', function() {

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

  describe('Module Create positive tests', function() {

    it('create a new module with defaults', function(done) {

      this.timeout(0);

      let evt = {
        options: {
          component:   'nodejscomponent',
          module:   'newmodule',
          function: 'newfunction'
        }
      };

      serverless.actions.moduleCreate(evt)
          .then(function(evt) {
            let functionJson = utils.readAndParseJsonSync(path.join(serverless.config.projectPath, 'nodejscomponent', 'newmodule', 'newfunction', 's-function.json'));
            assert.equal(true, typeof functionJson.name != 'undefined');
            assert.equal(true, functionJson.endpoints.length);

            validateEvent(evt);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
