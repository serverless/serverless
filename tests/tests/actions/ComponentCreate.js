'use strict';

/**
 * Test: Component Create Action
 * - Creates a new project in your system's temp directory
 * - Creates a new Component inside test project
 */

let Serverless  = require('../../../lib/Serverless.js'),
  path          = require('path'),
  utils         = require('../../../lib/utils/index'),
  assert        = require('chai').assert,
  testUtils     = require('../../test_utils'),
  config        = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.runtime != 'undefined');
  assert.equal(true, typeof evt.data.name != 'undefined');
};

describe('Test action: Component Create', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projectPath => {

        process.chdir(projectPath);

        serverless = new Serverless({
          projectPath,
          interactive: false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey
        });

        return serverless.init().then(function() {
          done();
        });
      });
  });

  after(function(done) {
    done();
  });

  describe('Component Create positive tests', function() {

    it('create a new component with defaults', function(done) {

      this.timeout(0);

      serverless.actions.componentCreate({
          name: 'newcomponent',
          runtime: 'nodejs'
        })
        .then(function(evt) {
          validateEvent(evt);
          let componentJson = utils.readFileSync(serverless.getProject().getRootPath( 'newcomponent', 's-component.json'));
          assert.equal(componentJson.name, 'newcomponent');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
