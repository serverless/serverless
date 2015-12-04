'use strict';

const SError     = require('./ServerlessError'),
      SCli       = require('./utils/cli'),
      BbPromise  = require('bluebird');

/**
 * This is the base class that all Serverless Plugins should extend.
 */

class ServerlessPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    this.S      = S;
    this.config = config;
  }

  /**
   * Define your plugins name
   */

  static getName() {
    return 'com.yourdomain.' + ServerlessPlugin.name;
  }

  /**
   * Register Actions
   */

  registerActions() {
    return BbPromise.resolve();
  }

  /**
   * Register Hooks
   */

  registerHooks() {
    return BbPromise.resolve();
  }

  /**
   * Prompt Input
   * - Handy CLI Prompt Input function for Plugins
   * @param promptSchema @see https://github.com/flatiron/prompt#prompting-with-validation-default-values-and-more-complex-properties
   * @param overrides map {key: 'overrideValue'}
   * @returns {Promise} containing answers by key
   */

  promptInput(promptSchema, overrides) {
    if (this.S._interactive) { //CLI
      let Prompter      = SCli.prompt();
      Prompter.override = overrides;
      return Prompter.getAsync(promptSchema);
    } else if (this.S.isWebInterface) {
      //TODO: implement
      return BbPromise.reject(new SError('Not implemented', SError.errorCodes.UNKNOWN));
    } else {
      return BbPromise.resolve(); //in non interactive mode. All options must be set programatically
    }
  }

  /**
   * Select Input
   * - Handy CLI Select Input function for Plugins
   * @param message string
   * @param choices [{key:"",value:"",label:""}]
   * @param multi boolean
   * @param doneLabel string optional
   * @returns {Promise} containing [{value:'blah'},..]
   */

  selectInput(message, choices, multi, doneLabel) {
    if (this.S._interactive) { //CLI
      return SCli.select(message, choices, multi, doneLabel);
    } else if (this.S.isWebInterface) {
      //TODO: implement
      return BbPromise.reject(new SError('Not implemented', SError.errorCodes.UNKNOWN));
    } else {
      return BbPromise.reject(new SError('You must specify all necessary options when in a non-interactive mode', SError.errorCodes.UNKNOWN));
    }
  }
}

module.exports = ServerlessPlugin;