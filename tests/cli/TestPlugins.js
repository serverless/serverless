'use strict';

/**
 * Test: Plugins
 */

let JAWS        = require('../../lib/Jaws.js'),
    JawsPlugin  = require('../../lib/JawsPlugin'),
    JawsError   = require('../../lib/jaws-error'),
    path        = require('path'),
    os          = require('os'),
    commop      = require ('commop'),
    utils       = require('../../lib/utils'),
    assert      = require('chai').assert,
    shortid     = require('shortid'),
    config      = require('../config');

/**
 * JAWS
 */

let Jaws = new JAWS({
  awsAdminKeyId: '123',
  awsAdminSecretKey: '123',
  interactive: false,
});

/**
 * Define Plugin
 */

class PromisePlugin extends JawsPlugin {

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Register Actions
   */

  registerActions() {
    this.Jaws.action(this._actionProjectCreate.bind(this), {
      handler:          'projectCreate',
      description:      'A plugin that customizes project creation',
      context:          'project',
      contextAction:    'create',
      options:          ['options'],
    }); // bind is optional
  }

  /**
   * Register Hooks
   */

  registerHooks() {
    this.Jaws.hook(this._hookPreProjectCreate.bind(this), {
      handler: 'projectCreate',
      event:   'pre'
    });
    this.Jaws.hook(this._hookPostProjectCreate.bind(this), {
      handler: 'projectCreate',
      event:   'post'
    });
  }

  /**
   * Plugin Logic
   * @param options
   * @returns {*|Promise.<T>}
   * @private
   */

  _actionProjectCreate(paramsTest1, paramsTest2) {
    let _this = this;
    return new Promise(function(resolve) {
      setTimeout(function(){
        _this.Jaws.generatorPluginAction = true;
        _this.Jaws.paramsTest1 = paramsTest1;
        _this.Jaws.paramsTest2 = paramsTest1;
        return resolve();
      }, 250);
    });

  }

  _hookPreProjectCreate() {
    let _this = this;
    return new Promise(function(resolve) {
      setTimeout(function(){
        _this.Jaws.generatorPluginHookPre = true;
        return resolve();
      }, 1000);
    });
  }

  _hookPostProjectCreate() {
    let _this = this;
    return new Promise(function(resolve) {
      setTimeout(function(){
        _this.Jaws.generatorPluginHookPost = true;
        return resolve();
      }, 250);
    });
  }
}

/**
 * Run Tests
 */

describe('Test Plugins', function() {

  before(function(done) {
    Jaws.addPlugin(new PromisePlugin(Jaws, {}));
    done();
  });

  after(function(done) {
    done();
  });

  describe('Test Plugin', function() {
    it('should run and attach values to context', function(done) {

      this.timeout(0);

      Jaws.projectCreate(true, true)
          .then(function() {
            // Test context
            assert.isTrue(Jaws.generatorPluginHookPre);
            assert.isTrue(Jaws.generatorPluginHookPost);
            assert.isTrue(Jaws.generatorPluginAction);
            // Test Params are passed through action handler
            assert.isTrue(Jaws.paramsTest1);
            assert.isTrue(Jaws.paramsTest2);
            done();
          })
          .catch(function(e) {
            done(e);
          });
    });
  });
});