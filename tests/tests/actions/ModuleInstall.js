'use strict';

/**
 * Test: Module Install Action
 * - Creates a new project in your system's temp directory
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

describe('Test action: Module Install', function() {

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

  describe('Module Install positive tests', function() {

    it('installs module-test Module from github', function(done) {
      this.timeout(0);
      let event = {
        url:   'https://github.com/serverless/serverless-module-test'
      };

      serverless.actions.moduleInstall(event)
          .then(function(evt) {

            assert.equal('https://github.com/serverless/serverless-module-test', evt.url);

            let functionJson = utils.readAndParseJsonSync(path.join(serverless._projectRootPath, 'back', 'modules', 'module-test', 'func', 's-function.json'));
            assert.equal(true, typeof functionJson.functions['Module-testFunc'] != 'undefined');
            assert.equal(true, typeof functionJson.functions['Module-testFunc'].endpoints['module-test/func'] != 'undefined');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
