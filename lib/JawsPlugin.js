'use strict';

const JawsError = require('./jaws-error'),
      JawsCLI   = require('./utils/cli'),
      BbPromise   = require('bluebird');

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
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'com.yourdomain.' + JawsPlugin.name;
  }

  /**
   * @returns {Promise} ES6 native upon completion of all registrations
   */
  registerActions() {
    //This is where you do something like below.
    //NOTE: the order of the options should exactly match the order of the params to your `theAction` method

    //this.Jaws.action(this.theAction.bind(this), {
    //  handler: 'deployLambda',
    //  description: 'deploys lambda code',
    //  context: 'lambda',
    //  contextAction: 'queued',
    //  options: [
    //    {
    //      option: 'stage',
    //      shortcut: 's',
    //      description: 'Stage to queued to'
    //    },
    //    ...
    //  ],
    //});

    return BbPromise.resolve();
  }

  /**
   * @returns {Promise} ES6 native upon completion of all registrations
   */
  registerHooks() {
    return BbPromise.resolve();
  }

  /**
   *
   * @param promptSchema @see https://github.com/flatiron/prompt#prompting-with-validation-default-values-and-more-complex-properties
   * @param overrides map {key: 'overrideValue'}
   * @returns {Promise} containing answers by key
   */
  promptInput(promptSchema, overrides) {
    if (this.Jaws._interactive) { //CLI
      let Prompter      = JawsCLI.prompt();
      Prompter.override = overrides;
      return Prompter.getAsync(promptSchema);
    } else if (this.Jaws.isWebInterface) {
      //TODO: implement
      return BbPromise.reject(new JawsError('Not implemented', JawsError.errorCodes.UNKNOWN));
    } else {
      return BbPromise.resolve(); //in non interactive mode. All options must be set programatically
    }
  }

  /**
   *
   * @param message string
   * @param choices [{key:"",value:"",label:""}]
   * @param multi boolean
   * @param doneLabel string optional
   * @returns {Promise} containing [{value:'blah'},..]
   */
  selectInput(message, choices, multi, doneLabel) {
    if (this.Jaws._interactive) { //CLI
      return JawsCLI.select(message, choices, multi, doneLabel);
    } else if (this.Jaws.isWebInterface) {
      //TODO: implement
      return BbPromise.reject(new JawsError('Not implemented', JawsError.errorCodes.UNKNOWN));
    } else {
      return BbPromise.reject(new JawsError('You must specify all necessary options when in a non-interactive mode', JawsError.errorCodes.UNKNOWN));
    }
  }
}

module.exports = JawsPlugin;
