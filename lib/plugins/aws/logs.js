'use strict';

const _ = require('lodash');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const wait = require('timers-ext/promise/sleep');
const validate = require('./lib/validate');
const formatLambdaLogEvent = require('./utils/formatLambdaLogEvent');
const ServerlessError = require('../../serverless-error');

dayjs.extend(utc);

class AwsLogs {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'logs:logs': async () => {
        this.extendedValidate();
        const logStreamNames = await this.getLogStreams();
        await this.showLogs(logStreamNames);
      },
    };
  }

  extendedValidate() {
    this.validate();

    // validate function exists in service
    const lambdaName = this.serverless.service.getFunction(this.options.function).name;

    this.options.interval = this.options.interval || 1000;
    this.options.logGroupName = this.provider.naming.getLogGroupName(lambdaName);
  }

  async getLogStreams() {
    const params = {
      logGroupName: this.options.logGroupName,
      descending: true,
      limit: 50,
      orderBy: 'LastEventTime',
    };

    const reply = await this.provider.request('CloudWatchLogs', 'describeLogStreams', params);
    if (!reply || reply.logStreams.length === 0) {
      throw new ServerlessError('No existing streams for the function', 'NO_EXISTING_LOG_STREAMS');
    }

    return reply.logStreams.map((logStream) => logStream.logStreamName);
  }

  async showLogs(logStreamNames) {
    if (!logStreamNames || !logStreamNames.length) {
      if (this.options.tail) {
        await wait(this.options.interval);
        const newLogStreamNames = await this.getLogStreams();
        await this.showLogs(newLogStreamNames);
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
      const since =
        ['m', 'h', 'd'].indexOf(this.options.startTime[this.options.startTime.length - 1]) !== -1;
      if (since) {
        params.startTime = dayjs()
          .subtract(
            this.options.startTime.replace(/\D/g, ''),
            this.options.startTime.replace(/\d/g, '')
          )
          .valueOf();
      } else {
        params.startTime = dayjs.utc(this.options.startTime).valueOf();
      }
    } else {
      params.startTime = dayjs().subtract(10, 'm').valueOf();
      if (this.options.tail) {
        params.startTime = dayjs().subtract(10, 's').valueOf();
      }
    }

    const results = await this.provider.request('CloudWatchLogs', 'filterLogEvents', params);
    if (results.events) {
      results.events.forEach((e) => {
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

      await wait(this.options.interval);
      const newLogStreamNames = await this.getLogStreams();
      await this.showLogs(newLogStreamNames);
    }
  }
}

module.exports = AwsLogs;
