'use strict';

/**
 * This is the base class that all JAWS plugins should extend.
 *
 */
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
   * @returns {Promise} ES6 native upon completion of all registrations
   */
  registerActions() {
    return Promise.resolve();
  }

  /**
   * @returns {Promise} ES6 native upon completion of all registrations
   */
  registerHooks() {
    return Promise.resolve();
  }
}

module.exports = JawsPlugin;