'use strict';

const JawsPlugin = require('./JawsPlugin'),
      Promise    = require('bluebird');


class RyansPlugin extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */
  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */
  registerActions() {
    this.Jaws.action('ProjectCreate', this._actionProjectCreate());
    return Promise.resolve();
  }

  registerHooks() {
    this.Jaws.hook('PostProjectCreate', this._hookPostProjectCreate());
    this.Jaws.hook('PreProjectCreate', this._hookPreProjectCreate());
    this.Jaws.hook('PostProjectCreate', this._hookPostProjectCreate2());
    return Promise.resolve();
  }

  _hookPreProjectCreate() {
    return function*() {
      console.log('hook pre project create fired')
      yield Promise.delay(2000);
      console.log("hook pre project create done");
      return;
    }
  }

  _actionProjectCreate() {
    return function*() {
      console.log('action project create fired')
      yield Promise.delay(2000);
      console.log("action project create done");
      return;
    }
  }

  _hookPostProjectCreate() {
    return function*() {
      console.log('hook post project create fired');
      var testPushBack1 = yield Promise.resolve('test push back 1 success!')
      var testPushBack2 = yield Promise.delay(2000).then(function() {
        return 'test push back 2 success!';
      });
      console.log("hook post project create done...", testPushBack1, testPushBack2);
      return;
    }
  }

  _hookPostProjectCreate2() {
    return function*() {
      console.log('hook post project 2 create fired');
      var testPushBack1 = yield Promise.resolve('test push back 1 success!')
      var testPushBack2 = yield Promise.delay(2000).then(function() {
        return 'test push back 2 success!';
      });
      console.log("hook post project 2 create done...", testPushBack1, testPushBack2);
      return;
    }
  }
}

module.exports = RyansPlugin;