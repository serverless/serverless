'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

module.exports     = function(S) {

    const path     = require('path'),
        SError     = require(S.getServerlessPath('Error')),
        SCli       = require(S.getServerlessPath('utils/cli')),
        SUtils     = S.utils,
        BbPromise  = require('bluebird'),
        chalk      = require('chalk');

    /**
     * FunctionRun Class
     */

    class FunctionRun extends S.classes.Plugin {

        static getName() {
            return 'serverless.core.' + this.name;
        }

        registerActions() {
            S.addAction(this.functionRun.bind(this), {
                handler:       'functionRun',
                description:   `Runs the service locally.  Reads the service’s runtime and passes it off to a runtime-specific runner`,
                context:       'function',
                contextAction: 'run',
                options:       [
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
                        option:      'runDeployed',
                        shortcut:    'd',
                        description: 'invoke deployed function'
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
                        parameter: 'name',
                        description: 'The name of the function you want to run',
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
            return this._prompt()
                .bind(_this)
                .then(_this._validateAndPrepare)
                .then(function() {
                    // Run local or deployed
                    if (_this.evt.options.runDeployed) {
                        return _this._runDeployed();
                    } else {
                        return _this._runLocal();
                    }
                })
                .then(() => this.evt);
        }

        _prompt() {
          if (!S.config.interactive || this.evt.options.stage) return BbPromise.resolve();
          return this.cliPromptSelectStage('Function Run - Choose a stage: ', this.evt.options.stage, false)
            .then(stage => this.evt.options.stage = stage)
            .then(() => this.cliPromptSelectRegion('Select a region: ', false, true, this.evt.options.region, this.evt.options.stage) )
            .then(region => this.evt.options.region = region);
        }

        /**
         * Validate And Prepare
         */

        _validateAndPrepare() {

            let _this = this;

            // If CLI and path is not specified, deploy from CWD if Function
            if (S.cli && !_this.evt.options.name) {
                // Get all functions in CWD
                if (!SUtils.fileExistsSync(path.join(process.cwd(), 's-function.json'))) {
                    return BbPromise.reject(new SError('You must be in a function folder to run it'));
                }
                _this.evt.options.name = process.cwd().split(path.sep)[process.cwd().split(path.sep).length - 1];
            }


            _this.function = S.getProject().getFunction(_this.evt.options.name);

            // Missing function
            if (!_this.function) return BbPromise.reject(new SError(`Function ${_this.evt.options.name} does not exist in your project.`));

            return BbPromise.resolve();
        }

        /**
         * Run Local
         */

        _runLocal() {
            if (!this.evt.options.name) {
                return BbPromise.reject(new SError('Please provide a function name to run'));
            }
            SCli.log(`Running ${this.evt.options.name}...`);
            return this.function.run(this.evt.options.stage, this.evt.options.region)
                .then(result => this.evt.data.result = result);
        }

        /**
         * Run Deployed
         */

        _runDeployed() {
            let _this   = this;

            _this.evt.options.invocationType  = _this.evt.options.invocationType || 'RequestResponse';
            _this.evt.options.region          = _this.evt.options.region || S.getProject().getAllRegions(_this.evt.options.stage)[0].name;

            if (_this.evt.options.invocationType !== 'RequestResponse') {
                _this.evt.options.logType = 'None';
            } else {
                _this.evt.options.logType = _this.evt.options.log ? 'Tail' : 'None'
            }

            // validate stage: make sure stage exists
            if (!S.getProject().validateStageExists(_this.evt.options.stage)) {
                return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
            }

            // validate region: make sure region exists in stage
            if (!S.getProject().validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
                return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
            }

            // Invoke Lambda

            let params = {
                FunctionName: _this.function.getDeployedName({ stage: _this.evt.options.stage, region: _this.evt.options.region }),
                // ClientContext: new Buffer(JSON.stringify({x: 1, y: [3,4]})).toString('base64'),
                InvocationType: _this.evt.options.invocationType,
                LogType: _this.evt.options.logType,
                Payload: new Buffer(JSON.stringify(SUtils.readFileSync(_this.function.getRootPath('event.json')))),
                Qualifier: _this.evt.options.stage
            };

            return S.getProvider('aws')
                .request('Lambda', 'invoke', params, _this.evt.options.stage, _this.evt.options.region)
                .then( reply => {

                    let color = !reply.FunctionError ? 'white' : 'red';

                    if (reply.Payload) {
                        let payload = JSON.parse(reply.Payload)
                        S.config.interactive && console.log(chalk[color](JSON.stringify(payload, null, '    ')));
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