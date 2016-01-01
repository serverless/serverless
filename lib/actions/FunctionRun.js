'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

module.exports = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SError      = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils      = require(path.join(serverlessPath, 'utils')),
    BbPromise   = require('bluebird'),
    fs          = require('fs');

  BbPromise.promisifyAll(fs);

  /**
   * FunctionRun Class
   */

  class FunctionRun extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + FunctionRun.name;
    }

    registerActions() {
      this.S.addAction(this.functionRun.bind(this), {
        handler:       'functionRun',
        description:   `Runs the service locally.  Reads the service’s runtime and passes it off to a runtime-specific runner`,
        context:       'function',
        contextAction: 'run',
        options:       [
          {
            option:      'name',
            shortcut:    'n',
            description: 'Optional - Run a specific function by name in the current working directory'
          }, {
            option:      'path',
            shortcut:    'p',
            description: 'Optional - Run a specific function by path in the current working directory'
          }
        ],
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    functionRun(evt) {

      let _this = this;

      // If CLI, parse options
      if (_this.S.cli) {

        // Options
        evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

        // Option - Non-interactive
        if (_this.S.cli.options.nonInteractive) _this.S.config.interactive = false
      }

      return _this._loadFunction(evt)
          .bind(_this)
          .then(_this._loadTestEvent)
          .then(_this._runFunction)
          .then(function(evt) {
            return evt;
          })
    }

    /**
     * Load Function
     */

    _loadFunction(evt) {

      let _this = this,
          cwd   = process.cwd();

      // If "path" is provided, find function by path
      if (evt.path) {

        return SUtils.getFunctions(_this.S.config.projectPath, [evt.path])
            .then(function(functions) {

              // If no functions found, throw error
              if (!functions.length) {
                throw new SError(`Could not find a function with the path: ${evt.path}`);
              }

              // Load event object
              evt.function   = functions[0];

              // Return
              return evt;
            });
      }

      // If "name" is provided, find function by name
      if (evt.name) {

        return SUtils.getFunctions(_this.S.config.projectPath, null)
            .then(function(functions) {

              // If no functions found, throw error
              if (!functions.length) {
                throw new SError(`Your project has no functions`);
              }

              for (let i = 0; i < functions.length; i++) {
                if (functions[i].name === evt.name || functions[i].name === evt.name.toLowerCase()) {
                  evt.function = functions[i];
                  break;
                }
              }
              if (!evt.function) throw new SError(`Could not find a function with the name ${evt.name}`);

              // Return
              return evt;
            });
      }

      // If interactive and no function name or path provided, show select screen
      if (_this.S.cli && _this.S.config.interactive) {

        // Otherwise show select screen
        return _this.cliPromptSelectFunctions(cwd, 'Select a function to run: ', false, true)
            .then(function (selected) {

              // If no functions found, throw error
              if (!selected.length) {
                throw new SError(`Could not find any functions.`);
              }

              evt.function = selected[0];

              return evt;
            });
      }

      // Otherwise, through error
      throw new SError(`No function specified`);
    }

    /**
     * Populate the test event from the correct event.json file
     */

    _loadTestEvent(evt) {

      let _this = this,
       eventPathSpecific = path.join(_this.S.config.projectPath, evt.function.pathFunction, evt.function.name + '-event.json'),
       eventPathGeneral  = path.join(_this.S.config.projectPath, evt.function.pathFunction, 'event.json'),
       testEvent         = {};

      // check for a function specific json <function-name>.json
      // otherwise check for a generic event.json file and look for a specific object node
      // lastly populate it with an empty object
      if (fs.existsSync(eventPathSpecific)) {
        testEvent = SUtils.readAndParseJsonSync(eventPathSpecific);
      } else if (fs.existsSync(eventPathGeneral)) {
        testEvent = SUtils.readAndParseJsonSync(eventPathGeneral);
        // Look for a property named after the function in the event object
        if (testEvent[evt.function.name]) testEvent = testEvent[evt.function.name];
      }

      evt.function.event = testEvent;

      return evt;
    }

    /**
     * Run Function By Runtime
     */

    _runFunction(evt) {

      let _this = this;

      // Run by runtime
      if (evt.function.module.runtime === 'nodejs') {

        // Fire NodeJs subaction
        let newEvent = {
          function: evt.function,
        };

        return _this.S.actions.functionRunLambdaNodeJs(newEvent)
            .then(function(evt) {
              return evt;
            });
      }
    }
  }

  return( FunctionRun );
};
