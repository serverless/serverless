'use strict';

const JawsPlugin = require('./JawsPlugin'),
      Promise    = require('bluebird');

class RyansPlugin extends JawsPlugin {
  /**
   *
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
    this.Jaws.action('ProjectCreate', this._projectCreateAction());
    return Promise.resolve();
  }

  _projectCreateAction() {
    return function*(next) {
      console.log('In RyansPlugin::projectCreateAction');
      yield 'Value';
    }
  }
}

module.exports = RyansPlugin;