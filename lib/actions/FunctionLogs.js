'use strict';

/**
 * Action: FunctionLogs
 * - Get a function logs
 *
 * Event Properties:
 * - stage:        (String)  The function stage
 * - region:       (String)  The function region
 * - tail:         (Boolean) Tail the log output
 * - duration:     (String)  Duration
 * - filter:       (String)  A filter pattern
 * - pollInterval: (String)  Tail polling interval in milliseconds
 * - path:         (String)  Path of the function
 */

module.exports = function(SPlugin, serverlessPath) {
  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    _            = require('lodash'),
    chalk     = require('chalk'),
    moment       = require('moment');

  return class FunctionLogs extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + FunctionLogs.name;
    }

    registerActions() {
      this.S.addAction(this.functionLogs.bind(this), {
        handler:       'functionLogs',
        description:   'Show the log entries of a function',
        context:       'function',
        contextAction: 'logs',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'The function stage'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'The function region'
          }
          , {
            option:      'tail',
            shortcut:    't',
            description: 'Optional - Tail the log output'
          }
          , {
            option:      'duration',
            shortcut:    'd',
            description: 'Optional - Duration. Default: `5m`.'
          }
          , {
            option:      'filter',
            shortcut:    'f',
            description: 'Optional - A filter pattern'
          }
          , {
            option:      'pollInterval',
            description: 'Optional - Tail polling interval in milliseconds. Default: `1000`.'
          }

        ],
        parameters: [
          {
            parameter: 'path',
            description: 'Path of the function you want get logs from (moduleName/functionName)',
            position: '0'
          }
        ]
      });

      return BbPromise.resolve();
    }

    functionLogs(evt) {
      // Prompt: Stage
      this.evt = evt
      // if (!this.S.config.interactive) return BbPromise.resolve();

      if (!this.S.state.meta.getStages().length) return BbPromise.reject(new SError('No existing stages in the project'));

      return this.cliPromptSelectStage('Function Logs - Choose a stage: ', evt.options.stage, false)
        .then(stage => evt.options.stage = stage)
        .bind(this)
        .then(()=> this.cliPromptSelectRegion('Choose a Region in this Stage: ', false, true, evt.options.region, evt.options.stage))
        .then(region => evt.options.region = region)
        .then(this._validateAndPrepare)
        .then(this._showLogs)
        .then(() => this.evt)
    }

    _validateAndPrepare() {
      // Validate options
      if (!this.evt.options.stage) return BbPromise.reject(new SError(`Stage is required`));
      if (!this.evt.options.region) return BbPromise.reject(new SError(`Region is required`));
      if (!this.evt.options.pollInterval) this.evt.options.pollInterval = 1000;
      if (!this.evt.options.duration) this.evt.options.duration = '5m';

      // If a function path was not specified.
      if(!this.evt.options.path) {
        // If s-function.json exists in the current path, then use the current function path.
        if(SUtils.fileExistsSync(path.join(process.cwd(), 's-function.json'))) {
          const componentName = path.basename(path.join(process.cwd(), '..', '..'));
          const moduleName    = path.basename(path.join(process.cwd(), '..'));
          const functionName  = path.basename(process.cwd());
          this.evt.options.path = componentName + "/" + moduleName + "/" + functionName;
        }
        else {
          return BbPromise.reject(new SError('Missing required function path param. Run from within a function directory, or add a function path in this format: componentName/moduleName/functionName'));
        }
      }

      this.spinner = SCli.spinner();

      this.CWL = require('../utils/aws/CloudWatch')({
        region:          this.evt.options.region,
        accessKeyId:     this.S.config.awsAdminKeyId,
        secretAccessKey: this.S.config.awsAdminSecretKey
      });

      this.Lambda = require('../utils/aws/Lambda')({
        region:          this.evt.options.region,
        accessKeyId:     this.S.config.awsAdminKeyId,
        secretAccessKey: this.S.config.awsAdminSecretKey
      });

      const func     = this.S.state.getFunctions({paths: [this.evt.options.path]})[0],
            duration = this.evt.options.duration;

      this.evt.data.startTime = moment().subtract(duration.replace(/\D/g,''), duration.replace(/\d/g,'')).valueOf();

      const lambdaName = this.Lambda.sGetLambdaName(func.getProject().name, func.getComponent().name, func.getModule().name, func.name);

      this.evt.data.logGroupName = '/aws/lambda/' + lambdaName;
      this.evt.data.lambdaName = lambdaName;
    }

    _getLogStreamNames() {
      return this.Lambda.getAliasPromised({
          FunctionName: this.evt.data.lambdaName,
          Name: this.evt.options.stage
        })
        .then(reply => this.evt.data.version = reply.FunctionVersion)
        .then(() => this.CWL.sGetLogStreams(this.evt.data.logGroupName, 50))
        .then(reply => reply.logStreams)
        .then( logStreams => {
          if (logStreams.length === 0) return BbPromise.reject(new SError('No existing streams for the function'));

          return _.chain(logStreams)
            .filter(stream => stream.logStreamName.includes(`[${this.evt.data.version}]`))
            .map('logStreamName')
            .value();
        });
    }

    _formatLogEvent(event) {
      const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)'

      let msg = event.message;
      if (msg.startsWith('START') || msg.startsWith('END') || msg.startsWith('REPORT')) {
        return chalk.gray(msg);
      } else {
        let splitted = msg.split('\t'),
            reqId    = splitted[1];

        let date = chalk.green(moment(splitted[0]).format(dateFormat));
        let text = msg.split(reqId + '\t')[1];

        return `${date}\t${chalk.yellow(reqId)}\t${text}`;
      }
    }

    _showLogs() {
      return this._getLogStreamNames()
        .then( logStreamNames => {

          if (!logStreamNames.length) {
            if (this.evt.options.tail) {
              return setTimeout((()=> this._showLogs()), this.evt.options.pollInterval);
            } else {
              return BbPromise.reject(new SError('No existing streams for the function'));
            }
          }

          let params = {
            logGroupName: this.evt.data.logGroupName,
            interleaved: true,
            logStreamNames: logStreamNames,
            startTime: this.evt.data.startTime
          };

          if (this.evt.options.filter) params.filterPattern = this.evt.options.filter;
          if (this.evt.data.nextToken) params.nextToken = this.evt.data.nextToken;

          return this.CWL.filterLogEventsAsync(params)
            .then(results => {

              if (this.S.config.interactive && results.events) {
                results.events.forEach(e => {
                  process.stdout.write(this._formatLogEvent(e));
                });
              }

              if (results.nextToken) {
                this.evt.data.nextToken = results.nextToken;
              } else {
                delete this.evt.data.nextToken;
              }

              if (this.evt.options.tail) {
                if (results.events && results.events.length) {
                  this.evt.data.startTime = _.last(results.events).timestamp + 1;
                }

                return setTimeout((()=> this._showLogs()), this.evt.options.pollInterval);
              }
              else {
                return this.evt.data.results = results.events;
              }
            });
        });
    }

  }

}