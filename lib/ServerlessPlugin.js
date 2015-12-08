'use strict';

const SError     = require('./ServerlessError'),
    SUtils     = require('./utils/index'),
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

  /**
   * CLI: Select Function
   * - Prompt the user to select a function in the current working directory
   */

  selectFunctions(cwd, message, multi, skipSingles) {

    let _this = this;

    // If not interactive, throw error
    if (!this.S._interactive) {
      return BbPromise.reject(new SError('Sorry, this is only available in interactive mode'));
    }

    // Get Functions
    return SUtils.getFunctions(cwd, null)
        .then(function(functions) {

          // If no functions found, return
          if (!functions.length) {
            return [];
          }

          // Skip if only a single option is available
          if (functions.length === 1 && skipSingles) {
            return functions;
          }

          // Prepare function choices
          let choices = [];
          for (let i = 0; i < functions.length; i++) choices.push({
            key: "",
            value: functions[i],
            label: functions[i].name });

          // Show select input
          return _this.selectInput(message, choices, multi)
          .then(function(selected) {
              return selected;
          });
        });
  }
}

module.exports = ServerlessPlugin;