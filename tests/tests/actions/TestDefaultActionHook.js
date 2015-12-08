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
  
  _defaultActionPreHook(evt) {
    let _this = this;
    return new Promise(function (resolve) {
      setTimeout(function () {
        evt.hook = 'defaultActionPreHook';
        // Add evt data
        return resolve(evt);
      }, 250);
    });
  }
}

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.module != 'undefined');
  assert.equal(true, typeof evt.function != 'undefined');
  assert.equal(true, typeof evt.runtime != 'undefined');
};


describe('Test Default Action With Pre Hook', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {
          process.chdir(projPath);
          serverless = new Serverless({
            interactive: false,
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
        function: 'one',
      };

      serverless.actions.moduleCreate(event)
          .then(function(evt) {
            validateEvent(evt);
            let functionJson = utils.readAndParseJsonSync(path.join(serverless._projectRootPath, 'back', 'modules', 'temp', 'one', 's-function.json'));
            assert.equal(true, typeof functionJson.functions.TempOne != 'undefined');
            assert.equal(true, typeof functionJson.functions.TempOne.endpoints['temp/one'] != 'undefined');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
