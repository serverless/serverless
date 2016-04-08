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

module.exports = function(S) {

  const path  = require('path'),
    SUtils    = S.utils,
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    BbPromise = require('bluebird'),
    _         = require('lodash'),
    moment    = require('moment');

  return class FunctionLogs extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.functionLogs.bind(this), {
        handler:       'functionLogs',
        description:   'Show the log entries of a function',
        context:       'function',
        contextAction: 'logs',
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
            shortcut:    'i',
            description: 'Optional - Tail polling interval in milliseconds. Default: `1000`.'
          }

        ],
        parameters: [
          {
            parameter: 'name',
            description: 'Name of the function you want get logs for',
            position: '0'
          }
        ]
      });

      return BbPromise.resolve();
    }

    functionLogs(evt) {
      // Prompt: Stage
      this.evt = evt;

      if (!S.getProject().getAllStages().length) return BbPromise.reject(new SError('No existing stages in the project'));

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

      if (S.cli && !this.evt.options.name) {

        if (!SUtils.fileExistsSync(path.join(process.cwd(), 's-function.json'))) {
          throw new SError(`You must be in a function folder to run this command`);
        }

        this.evt.options.name = SUtils.readFileSync(path.join(process.cwd(), 's-function.json')).name;
      }

      if (!S.cli && !this.evt.options.name) throw new SError(`Please provide a function name as a parameter`);

      this.function = S.getProject().getFunction(this.evt.options.name);

      this.spinner = SCli.spinner();

      const duration = this.evt.options.duration;

      this.evt.data.startTime = moment().subtract(duration.replace(/\D/g,''), duration.replace(/\d/g,'')).valueOf();

      const lambdaName = this.function.getDeployedName({ stage: this.evt.options.stage, region: this.evt.options.region });

      this.evt.data.logGroupName = '/aws/lambda/' + lambdaName;
      this.evt.data.lambdaName = lambdaName;
    }

    _getLogStreams() {
      let params = {
        logGroupName: this.evt.data.logGroupName,
        descending:   true,
        limit:        50,
        orderBy:      'LastEventTime'
      };

      return S.getProvider('aws')
        .request('CloudWatchLogs', 'describeLogStreams', params, this.evt.options.stage, this.evt.options.region)
        .error(error => BbPromise.reject(new SError(error.message, SError.errorCodes.UNKNOWN)))
        .then(reply => reply.logStreams);
    }

    _getLogStreamNames() {
      const params = {
          FunctionName: this.evt.data.lambdaName,
          Name: this.evt.options.stage
        };

      return S.getProvider('aws')
        .request('Lambda', 'getAlias', params, this.evt.options.stage, this.evt.options.region)
        .bind(this)
        .then(reply => this.evt.data.version = reply.FunctionVersion)
        .then(this._getLogStreams)
        .then( logStreams => {
          if (logStreams.length === 0) return BbPromise.reject(new SError('No existing streams for the function'));

          return _.chain(logStreams)
            .filter(stream => stream.logStreamName.includes(`[${this.evt.data.version}]`))
            .map('logStreamName')
            .value();
        });
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

          return S.getProvider('aws')
            .request('CloudWatchLogs', 'filterLogEvents', params, this.evt.options.stage, this.evt.options.region)
            .then(results => {

              if (S.config.interactive && results.events) {
                results.events.forEach(e => {
                  process.stdout.write(SCli.formatLambdaLogEvent(e.message));
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
};