'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const _ = require('lodash');
const SDK = require('../');
const os = require('os');
const moment = require('moment');
const validate = require('../lib/validate');

class AwsLogs {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = 'aws';
    this.sdk = new SDK(serverless);

    Object.assign(this, validate);

    this.hooks = {
      'logs:logs': () => BbPromise.bind(this)
        .then(this.extendedValidate)
        .then(this.getLogStreams)
        .then(this.showLogs),
    };
  }

  extendedValidate() {
    this.validate();

    // validate function exists in service
    this.serverless.service.getFunction(this.options.function);

    if (!this.options.pollInterval) this.options.pollInterval = 1000;
    if (!this.options.duration) this.options.duration = '30m';

    this.options.startTime = this.options.startTime || moment().subtract(this.options
      .duration.replace(/\D/g, ''), this.options
      .duration.replace(/\d/g, '')).valueOf();

    this.options.logGroupName = `/aws/lambda/${this.serverless.service
      .service}-${this.options
      .stage}-${this.options
      .function}`;

    return BbPromise.resolve();
  }

  getLogStreams() {
    const params = {
      logGroupName: this.options.logGroupName,
      descending: true,
      limit: 50,
      orderBy: 'LastEventTime',
    };

    return this.sdk
      .request('CloudWatchLogs',
        'describeLogStreams',
        params,
        this.options.stage,
        this.options.region)
      .then(reply => {
        if (!reply || reply.logStreams.length === 0) {
          throw new this.serverless.classes
            .Error('No existing streams for the function');
        }

        return _.chain(reply.logStreams)
          .filter(stream => stream.logStreamName.includes('[$LATEST]'))
          .map('logStreamName')
          .value();
      });
  }

  showLogs(logStreamNames) {
    if (!logStreamNames || !logStreamNames.length) {
      if (this.options.tail) {
        return setTimeout((() => this.getLogStreams()
          .then(nextLogStreamNames => this.showLogs(nextLogStreamNames))),
          this.options.pollInterval);
      }
    }

    const formatLambdaLogEvent = (msgParam) => {
      let msg = msgParam;
      const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

      if (msg.startsWith('REPORT')) {
        msg = msg + os.EOL;
      }

      if (msg.startsWith('START') || msg.startsWith('END') || msg.startsWith('REPORT')) {
        return chalk.gray(msg);
      } else if (msg.trim() === 'Process exited before completing request') {
        return chalk.red(msg);
      }

      const splitted = msg.split('\t');

      if (splitted.length < 3 || new Date(splitted[0]) === 'Invalid Date') {
        return msg;
      }
      const reqId = splitted[1];
      const time = chalk.green(moment(splitted[0]).format(dateFormat));
      const text = msg.split(`${reqId}\t`)[1];

      return `${time}\t${chalk.yellow(reqId)}\t${text}`;
    };

    const params = {
      logGroupName: this.options.logGroupName,
      interleaved: true,
      logStreamNames,
      startTime: this.options.startTime,
    };

    if (this.options.filter) params.filterPattern = this.options.filter;
    if (this.options.nextToken) params.nextToken = this.options.nextToken;

    return this.sdk
      .request('CloudWatchLogs',
        'filterLogEvents',
        params,
        this.options.stage,
        this.options.region)
      .then(results => {
        if (results.events) {
          results.events.forEach(e => {
            process.stdout.write(formatLambdaLogEvent(e.message));
          });
        }

        if (results.nextToken) {
          this.options.nextToken = results.nextToken;
        } else {
          delete this.options.nextToken;
        }

        if (this.options.tail) {
          if (results.events && results.events.length) {
            this.options.startTime = _.last(results.events).timestamp + 1;
          }

          return setTimeout((() => this.getLogStreams()
              .then(nextLogStreamNames => this.showLogs(nextLogStreamNames))),
            this.options.pollInterval);
        }

        return BbPromise.resolve();
      });
  }
}

module.exports = AwsLogs;
