'use strict';

const Promise = require('bluebird');

class JawsPlugin {

  /**
   *
   * @param Jaws class object
   * @param config object
   */
  constructor(Jaws, config) {
    this.Jaws   = Jaws;
    this.config = config;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */
  registerActions() {
    return Promise.resolve();
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */
  registerHooks() {
    return Promise.resolve();
  }
}

module.exports = JawsPlugin;