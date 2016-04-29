'use strict';

/**
 * Test: Default Action Hook
 * - Adds a pre hook to a default action (ModuleCreate)
 * - validates the action ran correctly with the hook attached to the event
 */

let Serverless = require('../../../lib/Serverless.js'),
  SPlugin      = require('../../../lib/Plugin'),
  path         = require('path'),
  utils        = require('../../../lib/utils/index'),
  assert       = require('chai').assert,
  testUtils    = require('../../test_utils'),
  config       = require('../../config');

let serverless;

/**
 * Define Custom Plugin
 */

function loadPlugin(S) {

  class CustomPlugin extends S.classes.Plugin {

    constructor() {
      super();
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

      S.addHook(this._defaultActionPreHook.bind(this), {
        action: 'functionCreate',
        event: 'pre'
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

  return CustomPlugin;

}

/**
 * Validate Result
 * - Validate an event object's properties
 */

let validateResult = function(result) {
  assert.equal(true, typeof result.data.hook != 'undefined');
};

describe('Test Default Action With Pre Hook', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
      .then(projectPath => {

        serverless = new Serverless({
          projectPath,
          interactive: false
        });

        let customPlugin = loadPlugin(serverless);

        return serverless.init()
          .then(function() {
            return serverless.addPlugin(new customPlugin())
              .then(function() {
                done();
              });
          });
      });
  });

  describe('Test Default Action With Pre Hook', function() {
    it('adds a pre hook to Component Create default Action', function(done) {

      this.timeout(0);
      let evt = {
        options: {
          path:   'testFunction',
          template: 'function'
        }
      };

      serverless.actions.functionCreate(evt)
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
