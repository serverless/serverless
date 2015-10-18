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
    Promise     = require('bluebird'),
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

  _actionProjectCreate(options) {
    let _this = this;

    var deferred = Promise.pending();

    setTimeout(function() {
      _this.Jaws.generatorPluginAction = true;
      console.log(options);
      deferred.resolve();
    }, 500);

    return deferred.promise;
  }

  _hookPreProjectCreate() {
    let _this = this;
    return new Promise(function(resolve, reject) {
      _this.Jaws.generatorPluginHookPre = true;
      return resolve();
    })
  }

  _hookPostProjectCreate() {
    let _this = this;
    var deferred = Promise.pending();
    setTimeout(function() {
      _this.Jaws.generatorPluginHookPost = true;
      console.log('post hook resolved');
      deferred.resolve();
    }, 500);

    return deferred.promise;
  }
}

/**
 * Run Tests
 */

describe('Test Promise Plugins', function() {

  before(function(done) {
    Jaws.addPlugin(new PromisePlugin(Jaws, {}));
    done();
  });

  after(function(done) {
    done();
  });

  describe('Test Promise Plugins', function() {
    it('should run and attach values to context', function(done) {

      Jaws.projectCreate({
            name: 'test',
            stage: 'test',
            region: 'us-east-1',
            domain: 'test.com',
            notificationEmail: 'test@test.com',
          })
          .then(function() {
            assert.isTrue(Jaws.generatorPluginHookPre);
            assert.isTrue(Jaws.generatorPluginHookPost);
            assert.isTrue(Jaws.generatorPluginAction);
            done();
          })
          .catch(function(e) {
            done(e);
          });
    });
  });
});