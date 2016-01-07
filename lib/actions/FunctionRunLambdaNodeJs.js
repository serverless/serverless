'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

module.exports = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SError      = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils      = require(path.join(serverlessPath, 'utils')),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise   = require('bluebird'),
    chalk       = require('chalk'),
    context     = require(path.join(serverlessPath, 'utils/context'));


  class FunctionRunLambdaNodeJs extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + FunctionRunLambdaNodeJs.name;
    }

    registerActions() {

      this.S.addAction(this.functionRunLambdaNodeJs.bind(this), {
        handler:       'functionRunLambdaNodeJs',
        description:   'Runs a service that features a lambda using the nodejs runtime.'
      });

      return BbPromise.resolve();
    }

    /**
     * Function Run Lambda NodeJs
     */

    functionRunLambdaNodeJs(evt) {

      let _this    = this;
      _this.evt    = evt;

      if (!_this.evt.options.path || _this.evt.options.path.split('/').length != 3) {
        return BbPromise.reject(new SError('Invalid function path. Function path should be in this format: component/module/function .'));
      }

      // Instantiate Classes
      _this.function = new _this.S.classes.Function(_this.S, {
        component: _this.evt.options.path.split('/')[0],
        module:   _this.evt.options.path.split('/')[1],
        function: _this.evt.options.path.split('/')[2]
      });

      // Prepare result object
      _this.evt.data.result = { status: false };

      // Run Function
      return new BbPromise(function(resolve) {

        SCli.log(`Running ${_this.function.data.name}...`);

        try {

          // Load function file & handler
          let functionFile    = _this.function.data.handler.split('/').pop().split('.')[0];
          let functionHandler = _this.function.data.handler.split('/').pop().split('.')[1];
          let functionPath    = path.join(_this.S.config.projectPath, _this.function.component, _this.function.module, _this.function.data.name);
          functionFile        = path.join(functionPath, (functionFile + '.js'));
          functionHandler     = require(functionFile)[functionHandler];

          // Fire function
          let functionEvent = SUtils.readAndParseJsonSync(path.join(functionPath, 'event.json'));
          functionHandler(functionEvent, context(_this.function.data.name, function (err, result) {

            SCli.log(`-----------------`);

            // Show error
            if (err) {
              SCli.log(chalk.bold('Failed - This Error Was Returned:'));
              SCli.log(err.message);
              SCli.log(err.stack);
              _this.evt.data.result.status = 'error';
              _this.evt.data.result.response = err.message;
              return resolve();
            }

            // Show success response
            SCli.log(chalk.bold('Success! - This Response Was Returned:'));
            SCli.log(JSON.stringify(result));
            _this.evt.data.result.status   = 'success';
            _this.evt.data.result.response = result;
            return resolve();
          }));

        } catch(err) {

          SCli.log(`-----------------`);

          SCli.log(chalk.bold('Failed - This Error Was Thrown:'));
          SCli.log(err);
          _this.evt.data.result.status   = 'error';
          _this.evt.data.result.response = err.message;
          return resolve();
        }
      })
        .then(function() {

          /**
           * Return EVT
           */

          return _this.evt;

        })
    }
  }

  return( FunctionRunLambdaNodeJs );
};
