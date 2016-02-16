'use strict';

/**
 * Test: Module Install Action
 * - Creates a new private in your system's temp directory
 * - Installs module-test Module from github using the ModuleInstall action
 * - asserts that the Module was installed correctly
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
  assert.equal(true, typeof evt.data.module !== 'undefined');
  assert.equal(true, typeof evt.options.url !== 'undefined');
};

describe('Test action: Module Install', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {

          process.chdir(projPath);

          serverless = new Serverless({
            interactive: false,
            projectPath: projPath
          });

          return serverless.init().then(function() {
            done();
          });
        });
  });

  after(function(done) {
    done();
  });

  describe('Module Install positive tests', function() {

    it('installs module-test Module from github', function(done) {

      this.timeout(0);
      let evt = {
        options: {
          url: 'https://github.com/serverless/serverless-module-test'
        }
      };

      serverless.actions.moduleInstall(evt)
          .then(function(evt) {

            let Function = new serverless.classes.Function(serverless, {module: 'module-test', function: 'function-test'});
            assert.equal(Function.data.name, 'function-test');
            assert.equal('https://github.com/serverless/serverless-module-test', evt.options.url);

            // Validate Event
            validateEvent(evt);

            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
