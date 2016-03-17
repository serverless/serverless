'use strict';

/**
 * Test: Plugin
 * - You shouldn't modify "options" like this,
 * - but we're simply checking to see if data is passed through
 */

let Serverless = require('../../../lib/Serverless.js'),
  SPlugin    = require('../../../lib/Plugin'),
  path       = require('path'),
  assert     = require('chai').assert,
  config     = require('../../config');

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
     * Register Actions
     */

    registerActions() {

      S.addAction(this._actionOne.bind(this), {
        handler: 'actionOne',
        description: 'A test plugin',
        context: 'action',
        contextAction: 'one',
        options: [{
          option: 'option',
          shortcut: 'o',
          description: 'test option 1'
        }]
      });

      S.addAction(this._actionTwo.bind(this), {
        handler: 'actionTwo',
        description: 'A test plugin',
        context: 'action',
        contextAction: 'two',
        options: [{
          option: 'option',
          shortcut: 'o',
          description: 'test option 1'
        }]
      });

      S.addAction(this._actionThree.bind(this), {
        handler: 'actionThree',
        description: 'A test plugin',
        context: 'action',
        contextAction: 'three',
        options: [{
          option: 'option',
          shortcut: 'o',
          description: 'test option 1'
        }]
      });

      return Promise.resolve();
    }

    /**
     * Register Hooks
     */

    registerHooks() {

      S.addHook(this._hookPre.bind(this), {
        action: 'actionOne',
        event: 'pre'
      });
      S.addHook(this._hookPost.bind(this), {
        action: 'actionOne',
        event: 'post'
      });

      S.addHook(this._hookPreTwo.bind(this), {
        action: 'actionTwo',
        event: 'pre'
      });
      S.addHook(this._hookPostTwo.bind(this), {
        action: 'actionTwo',
        event: 'post'
      });

      S.addHook(this._hookPreThree.bind(this), {
        action: 'actionThree',
        event: 'pre'
      });
      S.addHook(this._hookPostThree.bind(this), {
        action: 'actionThree',
        event: 'post'
      });
      S.addHook(this._hookPreThreeTwo.bind(this), {
        action: 'actionThree',
        event: 'pre'
      });
      S.addHook(this._hookPostThreeTwo.bind(this), {
        action: 'actionThree',
        event: 'post'
      });

      return Promise.resolve();
    }

    /**
     * Plugin Logic
     * @returns {Promise}
     * @private
     */

    _actionOne(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionOne');
          // Add evt data
          return resolve(evt);
        }, 250);
      });
    }

    _hookPre(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionOnePre');
          // Add evt data
          return resolve(evt);
        }, 250);
      });
    }

    _hookPost(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionOnePost');
          // Add evt data
          return resolve(evt);
        }, 250);
      });
    }

    /**
     * Test Nesting 1 Action
     * @param evt
     * @returns {*}
     * @private
     */

    _actionTwo(evt) {
      let _this = this;
      evt.options.sequence.push('actionTwo');
      return S.actions.actionOne(evt);
    }

    _hookPreTwo(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionTwoPre');
          // Add evt data
          return resolve(evt);
        }, 250);
      });
    }

    _hookPostTwo(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionTwoPost');
          // Add evt data
          return resolve(evt);
        }, 250);
      });
    }

    /**
     * Test Chaining & Nesting Sub-Actions
     * @param evt
     * @returns {*}
     * @private
     */

    _actionThree(evt) {
      let _this = this;
      evt.options.sequence.push('actionThree');
      return S.actions.actionOne(evt)
        .then(S.actions.actionTwo);
    }

    _hookPreThree(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionThreePre');
          return resolve(evt);
        }, 250);
      });
    }

    _hookPostThree(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionThreePost');
          // Add evt data
          return resolve(evt);
        }, 250);
      });
    }

    _hookPreThreeTwo(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionThreePreTwo');
          // Add evt data
          return resolve(evt);
        }, 250);
      });
    }

    _hookPostThreeTwo(evt) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          evt.options.sequence.push('actionThreePostTwo');
          return resolve(evt);
        }, 250);
      });
    }
  }

  return CustomPlugin;
}

/**
 * Run Tests
 */

describe('Test Custom Plugin', function() {

  before(function(done) {

    serverless = new Serverless({
      interactive: false
    });

    let customPlugin = loadPlugin(serverless);

    serverless.init()
      .then(function(){
        return serverless.addPlugin(new customPlugin())
          .then(function() {
            done();
          });
      });
  });

  describe('Test Single Action', function() {
    it('should successfully run hooks and actions in sequence', function(done) {

      this.timeout(0);

      serverless.actions.actionOne({
          sequence: []
        })
        .then(function(evt) {
          // Test event object
          assert.isTrue(evt.options.sequence[0] === 'actionOnePre');
          assert.isTrue(evt.options.sequence[1] === 'actionOne');
          assert.isTrue(evt.options.sequence[2] === 'actionOnePost');
          done();
        })
        .catch(function(e) {
          done(e);
        });
    });
  });

  describe('Test Nested Sub-Action', function() {
    it('should successfully run hooks and actions in sequence', function(done) {

      this.timeout(0);

      serverless.actions.actionTwo({
          sequence: []
        })
        .then(function(evt) {
          // Test event object
          assert.isTrue(evt.options.sequence[0] === 'actionTwoPre');
          assert.isTrue(evt.options.sequence[1] === 'actionTwo');
          assert.isTrue(evt.options.sequence[2] === 'actionOnePre');
          assert.isTrue(evt.options.sequence[3] === 'actionOne');
          assert.isTrue(evt.options.sequence[4] === 'actionOnePost');
          assert.isTrue(evt.options.sequence[5] === 'actionTwoPost');
          done();
        })
        .catch(function(e) {
          done(e);
        });
    });
  });

  describe('Test Chained & Nested Sub-Actions w/ Multiple Hooks', function() {
    it('should successfully run hooks and actions in sequence', function(done) {

      this.timeout(0);

      serverless.actions.actionThree({
          sequence: []
        })
        .then(function(evt) {
          // Test event object
          assert.isTrue(evt.options.sequence[0] === 'actionThreePre');
          assert.isTrue(evt.options.sequence[1] === 'actionThreePreTwo');
          assert.isTrue(evt.options.sequence[2] === 'actionThree');
          assert.isTrue(evt.options.sequence[3] === 'actionOnePre');
          assert.isTrue(evt.options.sequence[4] === 'actionOne');
          assert.isTrue(evt.options.sequence[5] === 'actionOnePost');
          assert.isTrue(evt.options.sequence[6] === 'actionTwoPre');
          assert.isTrue(evt.options.sequence[7] === 'actionTwo');
          assert.isTrue(evt.options.sequence[8] === 'actionOnePre');
          assert.isTrue(evt.options.sequence[9] === 'actionOne');
          assert.isTrue(evt.options.sequence[10] === 'actionOnePost');
          assert.isTrue(evt.options.sequence[11] === 'actionTwoPost');
          assert.isTrue(evt.options.sequence[12] === 'actionThreePost');
          assert.isTrue(evt.options.sequence[13] === 'actionThreePostTwo');
          done();
        })
        .catch(function(e) {
          done(e);
        });
    });
  });
});