'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

module.exports = function(S) {

  const path   = require('path'),
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
      this.evt = evt;

      // Flow
      return this._prompt()
        .bind(this)
        .then(this._validateAndPrepare)
        .then(() => {
          // Run local or deployed
          if (this.evt.options.runDeployed) {
            return this._runDeployed();
          } else {
            return this._runLocal();
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

      // If CLI and path is not specified, deploy from CWD if Function
      if (S.cli && !this.evt.options.name) {
        // Get all functions in CWD
        if (!SUtils.fileExistsSync(path.join(process.cwd(), 's-function.json'))) {
          return BbPromise.reject(new SError('You must be in a function folder to run it'));
        }
        this.evt.options.name = SUtils.readFileSync(path.join(process.cwd(), 's-function.json')).name
      }

      this.function = S.getProject().getFunction(this.evt.options.name);

      // Missing function
      if (!this.function) return BbPromise.reject(new SError(`Function ${this.evt.options.name} does not exist in your project.`));

      // load event data if not it not present already
      if (this.evt.data.event) return BbPromise.resolve();

      return this._getEventFromStdIn()
        .then(event => event || S.utils.readFile(this.function.getRootPath('event.json')))
        .then(event => this.evt.data.event = event);
    }

    /**
     * Get event data from STDIN
     * If
     */

    _getEventFromStdIn() {
      return new BbPromise((resolve, reject) => {
        const stdin = process.stdin;
        const chunks = [];

        const onReadable = () => {
          const chunk = stdin.read();
          if (chunk !== null) chunks.push(chunk);
        };

        const onEnd = () => {
          try {
            resolve(JSON.parse(chunks.join('')));
          } catch(e) {
            reject(new SError("Invalid event JSON"));
          }
        };

        stdin.setEncoding('utf8');
        stdin.on('readable', onReadable);
        stdin.on('end', onEnd);

        setTimeout((() => {
          stdin.removeListener('readable', onReadable);
          stdin.removeListener('end', onEnd);
          stdin.end()
          resolve()
        }), 5);
      });
    }

    /**
     * Run Local
     */

    _runLocal() {
      const name = this.evt.options.name;
      const stage = this.evt.options.stage;
      const region = this.evt.options.region;
      const event = this.evt.data.event;

      if (!name) return BbPromise.reject(new SError('Please provide a function name to run'));

      SCli.log(`Running ${name}...`);

      return this.function.run(stage, region, event)
        .then(result => this.evt.data.result = result);
    }

    /**
     * Run Deployed
     */

    _runDeployed() {
      const stage = this.evt.options.stage;

      this.evt.options.invocationType  = this.evt.options.invocationType || 'RequestResponse';
      this.evt.options.region          = this.evt.options.region || S.getProject().getAllRegions(stage)[0].name;

      const region = this.evt.options.region;

      if (this.evt.options.invocationType !== 'RequestResponse') {
        this.evt.options.logType = 'None';
      } else {
        this.evt.options.logType = this.evt.options.log ? 'Tail' : 'None'
      }

      // validate stage: make sure stage exists
      if (!S.getProject().validateStageExists(stage)) {
        return BbPromise.reject(new SError(`Stage "${stage}" does not exist in your project`, SError.errorCodes.UNKNOWN));
      }

      // validate region: make sure region exists in stage
      if (!S.getProject().validateRegionExists(stage, region)) {
        return BbPromise.reject(new SError(`Region "${region}" does not exist in stage "${stage}"`));
      }

      // Invoke Lambda

      let params = {
        FunctionName: this.function.getDeployedName({ stage, region }),
        // ClientContext: new Buffer(JSON.stringify({x: 1, y: [3,4]})).toString('base64'),
        InvocationType: this.evt.options.invocationType,
        LogType: this.evt.options.logType,
        Payload: new Buffer(JSON.stringify(this.evt.data.event)),
        Qualifier: stage
      };

      return S.getProvider('aws')
        .request('Lambda', 'invoke', params, stage, region)
        .then( reply => {
          const color = !reply.FunctionError ? 'white' : 'red';

          if (reply.Payload) {
            const response = JSON.parse(reply.Payload);

            if (S.config.interactive) console.log(chalk[color](JSON.stringify(response, null, 4)));

            this.evt.data.result = {
              response,
              status: reply.FunctionError ? 'error' : 'success'
            };
          }

          if (reply.LogResult) {
            console.log(chalk.gray('--------------------------------------------------------------------'));
            const logResult = new Buffer(reply.LogResult, 'base64').toString();
            logResult.split('\n').forEach( line => console.log(SCli.formatLambdaLogEvent(line)) );
          }
        })
        .catch(e => {
          this.evt.data.result = {
            status:  'error',
            message: e.message,
            stack:   e.stack
          };

          return BbPromise.reject(e);
        });
    }
  }

  return( FunctionRun );
};