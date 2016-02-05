'use strict';

/**
 * Test: Default Action Hook
 * - Adds a pre hook to a default action (ModuleCreate)
 * - validates the action ran correctly with the hook attached to the event
 */

let Serverless = require('../../../lib/Serverless.js'),
    SPlugin    = require('../../../lib/ServerlessPlugin'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    config     = require('../../config');

let serverless;

/**
 * Define Plugin
 */

class CustomPlugin extends SPlugin {

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Define your plugins name
   */

  static getName() {
    return 'com.yourdomain.' + CustomPlugin.name;
  }

  /**
   * Register Hooks
   */

  registerHooks() {

    this.S.addHook(this._defaultActionPreHook.bind(this), {
      action: 'componentCreate',
      event:  'pre'
    });

    return Promise.resolve();
  }

  _defaultActionPreHook(evt) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        return resolve({
          options: evt.options,
          data: {
            hook: 'defaultActionPreHook'
          }
        });
      }, 250);
    });
  }
}

/**
 * Validate Result
 * - Validate an event object's properties
 */

let validateResult = function(result) {
  assert.equal(true, typeof result.options.name != 'undefined');
  assert.equal(true, typeof result.options.runtime != 'undefined');
  assert.equal(true, typeof result.data.hook != 'undefined');
};

describe('Test Default Action With Pre Hook', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {

          process.chdir(projPath);
          serverless = new Serverless({
            interactive: false,
            projectPath: projPath
          });

          serverless.addPlugin(new CustomPlugin(serverless, {}));

          return serverless.state.load().then(function() {
            done();
          });
        });
  });

  after(function(done) {
    done();
  });

  describe('Test Default Action With Pre Hook', function() {

    it('adds a pre hook to Component Create default Action', function(done) {

      this.timeout(0);
      let evt = {
        options: {
          name:   'testcomponent'
        }
      };

      serverless.actions.componentCreate(evt)
          .then(function(result) {
            validateResult(result);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
