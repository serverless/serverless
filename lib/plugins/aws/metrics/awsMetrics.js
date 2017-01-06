'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const _ = require('lodash');
const moment = require('moment');
const validate = require('../lib/validate');

class AwsMetrics {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'metrics:metrics': () => BbPromise.bind(this)
        .then(this.extendedValidate)
        .then(this.getMetrics)
        .then(this.showMetrics),
    };
  }

  extendedValidate() {
    this.validate();

    const today = new Date();
    const yesterday = moment().subtract(1, 'day').toDate();

    if (this.options.startTime) {
      const sinceDateMatch = this.options.startTime.match(/(\d+)(m|h|d)/);
      if (sinceDateMatch) {
        this.options.startTime = moment().subtract(sinceDateMatch[1], sinceDateMatch[2]).valueOf();
      }
    }

    // finally create a new date object
    this.options.startTime = new Date(this.options.startTime || yesterday);
    this.options.endTime = new Date(this.options.endTime || today);

    return BbPromise.resolve();
  }

  getMetrics() {
    const StartTime = this.options.startTime;
    const EndTime = this.options.endTime;
    const hoursDiff = Math.abs(EndTime - StartTime) / 36e5;
    const Period = (hoursDiff > 24) ? 3600 * 24 : 3600;
    const functions = this.options.function
      ? [this.serverless.service.getFunction(this.options.function).name]
      : this.serverless.service.getAllFunctionsNames();

    return BbPromise.map(functions, (functionName) => {
      const commonParams = {
        StartTime,
        EndTime,
        Namespace: 'AWS/Lambda',
        Period,
        Dimensions: [{ Name: 'FunctionName', Value: functionName }],
      };

      const invocationsParams = _.merge({}, commonParams, {
        MetricName: 'Invocations',
        Statistics: ['Sum'],
        Unit: 'Count',
      });
      const throttlesParams = _.merge({}, commonParams, {
        MetricName: 'Throttles',
        Statistics: ['Sum'],
        Unit: 'Count',
      });
      const errorsParams = _.merge({}, commonParams, {
        MetricName: 'Errors',
        Statistics: ['Sum'],
        Unit: 'Count',
      });
      const averageDurationParams = _.merge({}, commonParams, {
        MetricName: 'Duration',
        Statistics: ['Average'],
        Unit: 'Milliseconds',
      });

      const getMetrics = (params) =>
        this.provider.request('CloudWatch', 'getMetricStatistics', params);

      return BbPromise.all([
        getMetrics(invocationsParams),
        getMetrics(throttlesParams),
        getMetrics(errorsParams),
        getMetrics(averageDurationParams),
      ]).then((metrics) => metrics);
    });
  }

  showMetrics(metrics) {
    let message = '';

    if (this.options.function) {
      message += `${chalk.yellow.underline(this.options.function)}\n`;
    } else {
      message += `${chalk.yellow.underline('Service wide metrics')}\n`;
    }

    const formattedStartTime = moment(this.options.startTime).format('LLL');
    const formattedEndTime = moment(this.options.endTime).format('LLL');
    message += `${formattedStartTime} - ${formattedEndTime}\n\n`;

    if (metrics && metrics.length > 0) {
      const getDatapointsByLabel = (Label) =>
        _.chain(metrics)
          .flatten()
          .filter({ Label })
          .map('Datapoints')
          .flatten()
          .value();

      const invocationsCount = _.sumBy(getDatapointsByLabel('Invocations'), 'Sum');
      const throttlesCount = _.sumBy(getDatapointsByLabel('Throttles'), 'Sum');
      const errorsCount = _.sumBy(getDatapointsByLabel('Errors'), 'Sum');
      const durationAverage = _.meanBy(getDatapointsByLabel('Duration'), 'Average') || 0;

      // display the data
      message += `${chalk.yellow('Invocations:', invocationsCount, '\n')}`;
      message += `${chalk.yellow('Throttles:', throttlesCount, '\n')}`;
      message += `${chalk.yellow('Errors:', errorsCount, '\n')}`;
      message += `${chalk.yellow('Duration (avg.):', `${Number((durationAverage).toFixed(2))}ms`)}`;
    } else {
      message += `${chalk.yellow('There are no metrics to show for these options')}`;
    }

    this.serverless.cli.consoleLog(message);
    return BbPromise.resolve(message);
  }
}

module.exports = AwsMetrics;
