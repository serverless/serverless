'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

module.exports  = function(SPlugin, serverlessPath) {
  const path    = require('path'),
      SUtils      = require( path.join( serverlessPath, 'utils' ) ),
      SError      = require(path.join(serverlessPath, 'ServerlessError')),
      BbPromise   = require('bluebird'),
      awsMisc     = require(path.join(serverlessPath, 'utils/aws/Misc')),
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
            option:      'path',
            shortcut:    'p',
            description: 'Path of the function in this format: moduleName/functionName'
          },
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to get env var from'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to get env var from'
          }
        ],
        parameters: [
          {
            parameter: 'path',
            description: 'Path of the function you want to run (moduleName/functionName)',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    functionRun(evt) {

      let _this      = this;
      _this.evt      = evt;

      // Instantiate Classes
      _this.project  = _this.S.state.project.get();

      // If CLI and no paths targeted, deploy from CWD if Function
      if (_this.S.cli && !_this.evt.options.path) {

        // Get all functions in CWD
        let sPath = _this.getSPathFromCwd(_this.S.config.projectPath);

        if (!sPath) {
          throw new SError(`You must be in a function folder to run it`);
        }

        _this.evt.options.path = [sPath];
      }

      let funcs = _this.S.state.getFunctions({ paths: [_this.evt.options.path] });
      if (funcs.length > 1) {
        throw new SError(`You must be in a function folder to run it`);
      }
      _this.function = funcs[0];

      // Missing function
      if (!_this.function) return BbPromise.reject(new SError('Function could not be found at the path specified.'));

      // Flow
      return BbPromise.resolve(_this._fetchEnvFile())
          .bind(_this)
          .then(_this._runByRuntime)
          .then(function(evt) {

            // Delete temp stage/region env var
            if (_this.evt.options.stage && _this.evt.options.region) {
              fs.unlinkSync(path.join(_this.S.config.projectPath, _this.evt.options.path.split('/')[0], '.env'));
            }

            /**
             * Return EVT
             */

            return evt;

          });
    }


    /**
     * fetches env file from stage/region if provided
     */

    _fetchEnvFile() {
      let _this = this;

      if ((!_this.evt.options.stage || !_this.evt.options.region)) {
        return BbPromise.resolve();
      }

      // validate stage: make sure stage exists
      if (!_this.S.state.meta.get().stages[_this.evt.options.stage]) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // validate region: make sure region exists in stage
      if (!_this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region]) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
      }

      return awsMisc.getEnvFiles(_this.S, _this.evt.options.region, _this.evt.options.stage)
          .then(function(envMapsByRegion) {
            let contents = '';
            Object.keys(envMapsByRegion[0].vars).forEach(newKey => {
              contents += [newKey, envMapsByRegion[0].vars[newKey]].join('=') + '\n';
            });
            fs.writeFileAsync(path.join(_this.S.config.projectPath, _this.evt.options.path.split('/')[0], '.env'), contents);
            return BbPromise.resolve();
          });
    }

    /**
     * Run By Runtime
     */

    _runByRuntime() {

      let _this = this,
          runtime = _this.S.state.getComponents({ "paths": [_this.function._config.sPath] })[0].runtime

      let newOptions = {
        options: {
          path: _this.evt.options.path
        }
      };

      // Runtime: nodejs
      if (runtime === 'nodejs') {

        return _this.S.actions.functionRunLambdaNodeJs(newOptions);
      } else if (runtime === 'python2.7' ){
        return _this.S.actions.functionRunLambdaPython2(newOptions);
      } else {
        return BbPromise.reject(new SError(`Only nodejs runtime is supported.`));
      }
    }
  }

  return( FunctionRun );
};