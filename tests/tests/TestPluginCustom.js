'use strict';

/**
 * Test: Plugin
 */

let JAWS       = require('../../lib/Jaws.js'),
    JawsPlugin = require('../../lib/JawsPlugin'),
    path       = require('path'),
    assert     = require('chai').assert,
    config     = require('../config');

/**
 * JAWS
 */

let Jaws = new JAWS({
  awsAdminKeyId:     '123',
  awsAdminSecretKey: '123',
  interactive:       false,
});

/**
 * Define Plugin
 */

class CustomPlugin extends JawsPlugin {

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Define your plugins name
   * @returns {string}
   */

  static getName() {
    return 'com.yourdomain.' + CustomPlugin.name;
  }

  /**
   * Register Actions
   */

  registerActions() {

    this.Jaws.addAction(this._action.bind(this), {
      handler:       'pluginTest',
      description:   'A test plugin',
      context:       'plugin',
      contextAction: 'test',
      options:       [{
        option:      'option',
        shortcut:    'o',
        description: 'test option 1'
      }],
    });

    return Promise.resolve();
  }

  /**
   * Register Hooks
   */

  registerHooks() {

    this.Jaws.addHook(this._hookPre.bind(this), {
      handler: 'pluginTest',
      event:   'pre'
    });
    this.Jaws.addHook(this._hookPost.bind(this), {
      handler: 'pluginTest',
      event:   'post'
    });

    return Promise.resolve();
  }

  /**
   * Plugin Logic
   * @returns {Promise}
   * @private
   */

  _action(evt) {
    console.log("Action Fired:", evt);
    let _this = this;
    return new Promise(function(resolve) {
      setTimeout(function() {
        evt.action = true;
        // Add evt data
        return resolve(evt);
      }, 250);
    });
  }

  _hookPre(evt) {
    console.log("Pre Hook Fired:", evt);
    let _this = this;
    return new Promise(function(resolve) {
      setTimeout(function() {
        evt.pre = true;
        // Add evt data
        return resolve(evt);
      }, 250);
    });
  }

  _hookPost(evt) {
    console.log("Post Hook Fired:", evt);
    let _this = this;
    return new Promise(function(resolve) {
      setTimeout(function() {
        evt.post = true;
        // Add evt data
        return resolve(evt);
      }, 250);
    });
  }
}

/**
 * Run Tests
 */

describe('Test Custom Plugin', function() {

  before(function(done) {
    Jaws.addPlugin(new CustomPlugin(Jaws, {}));
    done();
  });

  after(function(done) {
    done();
  });

  describe('Test Custom Plugin', function() {
    it('should run and attach values to context', function(done) {

      this.timeout(0);
      Jaws.actions.pluginTest({
        test: true
      })
          .then(function(evt) {
            // Test event object
            assert.isTrue(evt.pre);
            assert.isTrue(evt.action);
            assert.isTrue(evt.post);
            done();
          })
          .catch(function(e) {
            done(e);
          });
    });
  });
});