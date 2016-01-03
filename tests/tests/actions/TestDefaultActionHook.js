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
      action: 'moduleCreate',
      event:  'pre'
    });

    return Promise.resolve();
  }

  _defaultActionPreHook(options) {
    let _this = this;
    return new Promise(function (resolve) {
      setTimeout(function () {
        options.hook = 'defaultActionPreHook';
        // Add options data
        return resolve(options);
      }, 250);
    });
  }
}

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(options) {
  assert.equal(true, typeof options.module != 'undefined');
  assert.equal(true, typeof options.function != 'undefined');
  assert.equal(true, typeof options.runtime != 'undefined');
  assert.equal(true, typeof options.hook != 'undefined');

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
          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Test Default Action With Pre Hook', function() {

    it('adds a pre hook to Module Create default Action', function(done) {
      this.timeout(0);
      let event = {
        module:   'temp',
        function: 'one'
      };

      serverless.actions.moduleCreate(event)
          .then(function(options) {
            validateEvent(options);
            let functionJson = utils.readAndParseJsonSync(path.join(serverless.config.projectPath, 'back', 'modules', 'temp', 'functions', 'one', 's-function.json'));
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
