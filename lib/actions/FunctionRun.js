'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

module.exports    = function(SPlugin, serverlessPath) {
    const path      = require('path'),
        SError      = require(path.join(serverlessPath, 'ServerlessError')),
        BbPromise   = require('bluebird'),
        chalk       = require('chalk'),
        SCli        = require( path.join( serverlessPath, 'utils', 'cli'));

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
                        description: 'region you want to run your function in'
                    },
                    {
                        option:      'stage',
                        shortcut:    's',
                        description: 'stage you want to run your function in'
                    },
                    {
                        option:      'invocationType',
                        shortcut:    'i',
                        description: 'Valid Values: Event | RequestResponse | DryRun . Default is RequestResponse'
                    },
                    {
                        option:      'log',
                        shortcut:    'l',
                        description: 'Show the log output'
                    }
                ],
                parameters: [
                    {
                        parameter: 'path',
                        description: 'Path of the function you want to run (componentName/functionName)',
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

            // Flow
            return _this._validateAndPrepare()
                .bind(_this)
                .then(function() {
                    // Run local or deployed
                    if (_this.evt.options.stage) {
                        return _this._runDeployed();
                    } else {
                        return _this._runLocal();
                    }
                })
                .then(() => this.evt);
        }

        /**
         * Validate And Prepare
         */

        _validateAndPrepare() {

            let _this = this;

            // If CLI and path is not specified, deploy from CWD if Function
            if (_this.S.cli && !_this.evt.options.path) {
                // Get all functions in CWD
                let sPath = _this.getSPathFromCwd(_this.S.getProject().getRootPath());
                if (!sPath || sPath.split('/').length == 1) {
                    return BbPromise.reject(new SError(`You must be in a function folder to run it`));
                }
                _this.evt.options.path = sPath;
            }

            // strip trailing slashes from path
            _this.evt.options.path = _this.evt.options.path.replace(/\/$/, "");

            let funcs = _this.S.getProject().getAllFunctions({ paths: [ _this.evt.options.path ]});
            if (funcs.length > 1) {
                return BbPromise.reject(new SError(`You must be in a function folder to run it`));
            }
            _this.function = funcs[0];

            // Missing function
            if (!_this.function) return BbPromise.reject(new SError('Function could not be found at the path specified.'));

            return BbPromise.resolve();
        }

        /**
         * Run Local
         */

        _runLocal() {

            let _this   = this,
                runtime = _this.function.getComponent().getRuntime();

            let newOptions = {
                options: {
                    path: _this.evt.options.path
                }
            };

            return BbPromise.try(function() {
                    return _this.S.actions[ runtime.getFunctionRunActionName() ](newOptions);
                })
                .then(function(evt) {
                    _this.evt.data.result = evt.data.result;
                });
        }

        /**
         * Run Deployed
         */

        _runDeployed() {
            let _this   = this;

            _this.evt.options.invocationType  = _this.evt.options.invocationType || 'RequestResponse';
            _this.evt.options.region          = _this.evt.options.region || _this.S.state.getRegions(_this.evt.options.stage)[0];

            if (_this.evt.options.invocationType !== 'RequestResponse') {
                _this.evt.options.logType = 'None';
            } else {
                _this.evt.options.logType = _this.evt.options.log ? 'Tail' : 'None'
            }

            // validate stage: make sure stage exists
            if (_this.S.state.getStages().indexOf(_this.evt.options.stage) == -1) {
                return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
            }

            // validate region: make sure region exists in stage
            if (_this.evt.options.region && !_this.S.state.getRegions(_this.evt.options.stage).indexOf(_this.evt.options.region) == -1) {
                return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
            }

            // Invoke Lambda

            _this.Lambda = require('../utils/aws/Lambda')({
                region:          _this.evt.options.region,
                accessKeyId:     _this.S.config.awsAdminKeyId,
                secretAccessKey: _this.S.config.awsAdminSecretKey
            });

            let params = {
                FunctionName: _this.function.getDeployedName({ stage: _this.evt.options.stage, region: _this.evt.options.region }),
                // ClientContext: new Buffer(JSON.stringify({x: 1, y: [3,4]})).toString('base64'),
                InvocationType: _this.evt.options.invocationType,
                LogType: _this.evt.options.logType,
                Payload: new Buffer(JSON.stringify(require(path.join(_this.function.getFullPath(), 'event')))),
                Qualifier: _this.evt.options.stage
            };

            return _this.Lambda.invokePromised(params)
                .then( reply => {

                    let color = !reply.FunctionError ? 'white' : 'red';

                    if (reply.Payload) {
                        let payload = JSON.parse(reply.Payload)
                        _this.S.config.interactive && console.log(chalk[color](JSON.stringify(payload, null, '    ')));
                        _this.evt.data.result = {
                            status:  'success',
                            response: payload
                        };
                    }

                    if (reply.LogResult) {
                        console.log(chalk.gray('--------------------------------------------------------------------'));
                        let logResult = new Buffer(reply.LogResult, 'base64').toString();
                        logResult.split('\n').forEach( line => {
                            console.log(SCli.formatLambdaLogEvent(line));
                        });
                    }
                })
                .catch(function(e) {
                    _this.evt.data.result = {
                        status:  'error',
                        message: e.message,
                        stack:   e.stack
                    };

                    BbPromise.reject(e);
                });
        }
    }

    return( FunctionRun );
};