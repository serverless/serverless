'use strict';

/**
 * Action: FunctionInvoke
 * - Invokes the function in the CWD
 *
 * Event Properties:
 * - stage:          (String)  The function stage
 * - region:         (String)  The function region
 * - log:            (Boolean) Show the log output
 * - invocationType: (String)  Invocation Type
 */

module.exports = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SUtils      = require( path.join( serverlessPath, 'utils' ) ),
    SError      = require(path.join(serverlessPath, 'ServerlessError')),
    BbPromise   = require('bluebird'),
    SCli        = require( path.join( serverlessPath, 'utils', 'cli')),
    _           = require('lodash'),
    chalk       = require('chalk');

  /**
   * FunctionInvoke Class
   */

  return class FunctionInvoke extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + FunctionInvoke.name;
    }

    registerActions() {
      this.S.addAction(this.functionInvoke.bind(this), {
        handler:       'functionInvoke',
        description:   'Invokes the function',
        context:       'function',
        contextAction: 'invoke',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'The function stage'
          }
          , {
            option:      'region',
            shortcut:    'r',
            description: 'The function region'
          }
          , {
            option:      'invocationType',
            shortcut:    'i',
            description: 'Valid Values: Event | RequestResponse | DryRun . Default is RequestResponse'
          }
          , {
            option:      'log',
            shortcut:    'l',
            description: 'Show the log output'
          }
        ],
        parameters: [
          {
            parameter: 'path',
            description: 'Path of the function you want to run (componentName/moduleName/functionName)',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    checkPath() {
      // If a function path was not specified.

      if(!this.evt.options.path) {
        // If s-function.json exists in the current path, then use the current function path.
        if(SUtils.fileExistsSync(path.join(process.cwd(), 's-function.json'))) {
          let componentName = path.basename(path.join(process.cwd(), '..', '..'));
          let moduleName    = path.basename(path.join(process.cwd(), '..'));
          let functionName  = path.basename(process.cwd());
          this.evt.options.path = componentName + "/" + moduleName + "/" + functionName;
        }
        else {
          return BbPromise.reject(new SError('Missing required function path param. Run from within a function directory, or add a function path in this format: componentName/moduleName/functionName'));
        }
      }
      return BbPromise.resolve()
    }

    /**
     * Action
     */

    functionInvoke(evt) {
      this.evt      = evt;

      if (!this.S.state.meta.getStages().length) return BbPromise.reject(new SError('No existing stages in the project'));

      return this.cliPromptSelectStage('Function Invoke - Choose a stage: ', evt.options.stage, false)
        .then(stage => evt.options.stage = stage)
        .bind(this)
        .then(()=> this.cliPromptSelectRegion('Choose a Region in this Stage: ', false, true, evt.options.region, evt.options.stage))
        .then(region => evt.options.region = region)
        .then(this._validateAndPrepare)
        .then(this._invoke)
        .then(() => this.evt);
    }

    _validateAndPrepare() {
      if (!this.evt.options.stage) return BbPromise.reject(new SError(`Stage is required`));
      if (!this.evt.options.region) return BbPromise.reject(new SError(`Region is required`));

      this.evt.options.invocationType = this.evt.options.invocationType || 'RequestResponse'

      if (this.evt.options.invocationType !== 'RequestResponse') {
        this.evt.options.logType = 'None';
      } else {
        this.evt.options.logType = this.evt.options.log ? 'Tail' : 'None'
      }

      // validate stage: make sure stage exists
      if (!this.S.state.meta.get().stages[this.evt.options.stage]) {
        return BbPromise.reject(new SError('Stage ' + this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // validate region: make sure region exists in stage
      if (!this.S.state.meta.get().stages[this.evt.options.stage].regions[this.evt.options.region]) {
        return BbPromise.reject(new SError('Region "' + this.evt.options.region + '" does not exist in stage "' + this.evt.options.stage + '"'));
      }

      this.Lambda = require('../utils/aws/Lambda')({
        region:          this.evt.options.region,
        accessKeyId:     this.S.config.awsAdminKeyId,
        secretAccessKey: this.S.config.awsAdminSecretKey
      });

      return this.checkPath()
        .then( () => {
          const func = this.S.state.getFunctions({paths: [this.evt.options.path]})[0];
          this.evt.data.lambdaName = this.Lambda.sGetLambdaName(func.getProject().name, func.getComponent().name, func.getModule().name, func.name);

          let functionPath = path.join(this.S.config.projectPath, this.evt.options.path);
          this.evt.data.event = require(path.join(functionPath, 'event'));
        })
        .then(() => {
          this.function = this.S.state.getFunctions({ paths: [this.evt.options.path] })[0];
          // Missing function
          if (!this.function) return BbPromise.reject(new SError('Function could not be found at the path specified.'));
        });
    }

    _invoke() {
      let params = {
        FunctionName: this.evt.data.lambdaName,
        // ClientContext: new Buffer(JSON.stringify({x: 1, y: [3,4]})).toString('base64'),
        InvocationType: this.evt.options.invocationType,
        LogType: this.evt.options.logType,
        Payload: new Buffer(JSON.stringify(this.evt.data.event)),
        Qualifier: this.evt.options.stage
      };

      return this.Lambda.invokePromised(params)
        .then( reply => {
          let color = !reply.FunctionError ? 'white' : 'red';

          if (reply.Payload) {
            this.S.config.interactive && console.log(chalk[color](JSON.stringify(JSON.parse(reply.Payload), null, '    ')));
            this.evt.data.payload = reply.Payload
          }

          if (reply.LogResult) {
            console.log(chalk.gray('--------------------------------------------------------------------'))
            let logResult = new Buffer(reply.LogResult, 'base64').toString()
            _.each(logResult.split('\n'), (line) => {
              console.log(SCli.formatLambdaLogEvent(line));
            });
          }
        });
    }
  }
};