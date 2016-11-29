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

    // validate function exists in service
    this.options.function = this.serverless.service.getFunction(this.options.function).name;

    const today = new Date();
    let yesterday = new Date();
    yesterday = yesterday.setDate(yesterday.getDate() - 1);
    yesterday = new Date(yesterday);

    this.options.startTime = this.options.startTime || yesterday;
    this.options.endTime = this.options.endTime || today;

    return BbPromise.resolve();
  }

  getMetrics() {
    const FunctionName = this.options.function;
    const StartTime = this.options.startTime;
    const EndTime = this.options.endTime;
    const Namespace = 'AWS/Lambda';

    const hoursDiff = Math.abs(EndTime - StartTime) / 36e5;
    const Period = (hoursDiff > 24) ? 3600 * 24 : 3600;

    const promises = [];

    // get invocations
    const invocationsPromise = this.provider.request('CloudWatch',
      'getMetricStatistics',
      {
        StartTime,
        EndTime,
        MetricName: 'Invocations',
        Namespace,
        Period,
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: FunctionName,
          },
        ],
        Statistics: [
          'Sum',
        ],
        Unit: 'Count',
      },
      this.options.stage,
      this.options.region
    );
    // get throttles
    const throttlesPromise = this.provider.request('CloudWatch',
      'getMetricStatistics',
      {
        StartTime,
        EndTime,
        MetricName: 'Throttles',
        Namespace,
        Period,
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: FunctionName,
          },
        ],
        Statistics: [
          'Sum',
        ],
        Unit: 'Count',
      },
      this.options.stage,
      this.options.region
    );
    // get errors
    const errorsPromise = this.provider.request('CloudWatch',
      'getMetricStatistics',
      {
        StartTime,
        EndTime,
        MetricName: 'Errors',
        Namespace,
        Period,
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: FunctionName,
          },
        ],
        Statistics: [
          'Sum',
        ],
        Unit: 'Count',
      },
      this.options.stage,
      this.options.region
    );
    // get avg. duration
    const avgDurationPromise = this.provider.request('CloudWatch',
      'getMetricStatistics',
      {
        StartTime,
        EndTime,
        MetricName: 'Duration',
        Namespace,
        Period,
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: FunctionName,
          },
        ],
        Statistics: [
          'Average',
        ],
        Unit: 'Milliseconds',
      },
      this.options.stage,
      this.options.region
    );

    // push all promises to the array which will be used to resolve those
    promises.push(invocationsPromise);
    promises.push(throttlesPromise);
    promises.push(errorsPromise);
    promises.push(avgDurationPromise);

    return BbPromise.all(promises).then((metrics) => metrics);
  }

  showMetrics(metrics) {
    let message = '';

    message += `${chalk.yellow.underline(this.options.function)}\n`;

    const formattedStartTime = moment(this.options.startTime).format('LLL');
    const formattedEndTime = moment(this.options.endTime).format('LLL');
    message += `${formattedStartTime} - ${formattedEndTime}\n\n`;

    if (metrics && metrics.length > 0) {
      _.forEach(metrics, (metric) => {
        if (metric.Label === 'Invocations') {
          const datapoints = metric.Datapoints;
          const invocations = datapoints
            .reduce((previous, datapoint) => previous + datapoint.Sum, 0);
          message += `${chalk.yellow('Invocations:', invocations, '\n')}`;
        } else if (metric.Label === 'Throttles') {
          const datapoints = metric.Datapoints;
          const throttles = datapoints
            .reduce((previous, datapoint) => previous + datapoint.Sum, 0);
          message += `${chalk.yellow('Throttles:', throttles, '\n')}`;
        } else if (metric.Label === 'Errors') {
          const datapoints = metric.Datapoints;
          const errors = datapoints
            .reduce((previous, datapoint) => previous + datapoint.Sum, 0);
          message += `${chalk.yellow('Errors:', errors, '\n')}`;
        } else {
          const datapoints = metric.Datapoints;
          const duration = datapoints
            .reduce((previous, datapoint) => previous + datapoint.Average, 0);
          const formattedRoundedAvgDuration = `${Math.round(duration * 100) / 100}ms`;
          message += `${chalk.yellow('Duration (avg.):', formattedRoundedAvgDuration)}`;
        }
      });
    } else {
      message += `${chalk.yellow('There are no metrics to show for these options')}`;
    }
    this.serverless.cli.consoleLog(message);
    return BbPromise.resolve(message);
  }
}

module.exports = AwsMetrics;
