'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const validate = require('../lib/validate');
const formatLambdaLogEvent = require('../utils/formatLambdaLogEvent');

class AwsLogs {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

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
    const lambdaName = this.serverless.service.getFunction(this.options.function).name;

    this.options.interval = this.options.interval || 1000;
    this.options.logGroupName = this.provider.naming.getLogGroupName(lambdaName);

    return BbPromise.resolve();
  }

  getLogStreams() {
    const params = {
      logGroupName: this.options.logGroupName,
      descending: true,
      limit: 50,
      orderBy: 'LastEventTime',
    };

    return this.provider
      .request('CloudWatchLogs',
        'describeLogStreams',
        params)
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
          this.options.interval);
      }
    }

    const params = {
      logGroupName: this.options.logGroupName,
      interleaved: true,
      logStreamNames,
      startTime: this.options.startTime,
    };

    if (this.options.filter) params.filterPattern = this.options.filter;
    if (this.options.nextToken) params.nextToken = this.options.nextToken;
    if (this.options.startTime) {
      const since = (['m', 'h', 'd']
        .indexOf(this.options.startTime[this.options.startTime.length - 1]) !== -1);
      if (since) {
        params.startTime = moment().subtract(this.options
          .startTime.replace(/\D/g, ''), this.options
          .startTime.replace(/\d/g, '')).valueOf();
      } else {
        params.startTime = moment.utc(this.options.startTime).valueOf();
      }
    } else {
      params.startTime = moment().subtract(10, 'm').valueOf();
      if (this.options.tail) {
        params.startTime = moment().subtract(10, 's').valueOf();
      }
    }

    return this.provider
      .request('CloudWatchLogs',
        'filterLogEvents',
        params)
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
            this.options.interval);
        }

        return BbPromise.resolve();
      });
  }
}

module.exports = AwsLogs;
