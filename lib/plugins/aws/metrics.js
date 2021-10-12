'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const _ = require('lodash');
const dayjs = require('dayjs');
const validate = require('./lib/validate');
const { legacy, writeText, style } = require('@serverless/utils/log');

const LocalizedFormat = require('dayjs/plugin/localizedFormat');

dayjs.extend(LocalizedFormat);

class AwsMetrics {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'metrics:metrics': async () => {
        this.extendedValidate();
        const metrics = await this.getMetrics();
        this.showMetrics(metrics);
      },
    };
  }

  extendedValidate() {
    this.validate();

    const today = new Date();
    const yesterday = dayjs().subtract(1, 'day').toDate();

    if (this.options.startTime) {
      const sinceDateMatch = this.options.startTime.match(/(\d+)(m|h|d)/);
      if (sinceDateMatch) {
        this.options.startTime = dayjs().subtract(sinceDateMatch[1], sinceDateMatch[2]).valueOf();
      }
    }

    // finally create a new date object
    this.options.startTime = new Date(this.options.startTime || yesterday);
    this.options.endTime = new Date(this.options.endTime || today);
  }

  async getMetrics() {
    const StartTime = this.options.startTime;
    const EndTime = this.options.endTime;
    const hoursDiff = Math.abs(EndTime - StartTime) / 36e5;
    const Period = hoursDiff > 24 ? 3600 * 24 : 3600;
    const functions = this.options.function
      ? [this.serverless.service.getFunction(this.options.function).name]
      : this.serverless.service.getAllFunctionsNames();

    return Promise.all(
      functions.map(async (functionName) => {
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
        ]);
      })
    );
  }

  showMetrics(metrics) {
    let message = '';
    const modernMessageTokens = [];

    if (this.options.function) {
      message += `${chalk.yellow.underline(this.options.function)}\n`;
      modernMessageTokens.push(this.options.function);
    } else {
      message += `${chalk.yellow.underline('Service wide metrics')}\n`;
      modernMessageTokens.push('Service wide metrics');
    }

    const formattedStartTime = dayjs(this.options.startTime).format('LLL');
    const formattedEndTime = dayjs(this.options.endTime).format('LLL');
    message += `${formattedStartTime} - ${formattedEndTime}\n\n`;
    modernMessageTokens.push(`${formattedStartTime} - ${formattedEndTime}\n`);

    if (metrics && metrics.length > 0) {
      const getDatapointsByLabel = (Label) =>
        _.flatten(
          _.flatten(metrics)
            .filter((metric) => metric.Label === Label)
            .map((metric) => metric.Datapoints)
        );

      const invocationsCount = _.sumBy(getDatapointsByLabel('Invocations'), 'Sum');
      const throttlesCount = _.sumBy(getDatapointsByLabel('Throttles'), 'Sum');
      const errorsCount = _.sumBy(getDatapointsByLabel('Errors'), 'Sum');
      const durationAverage = _.meanBy(getDatapointsByLabel('Duration'), 'Average') || 0;

      // display the data
      message += `${chalk.yellow('Invocations:', invocationsCount, '\n')}`;
      message += `${chalk.yellow('Throttles:', throttlesCount, '\n')}`;
      message += `${chalk.yellow('Errors:', errorsCount, '\n')}`;
      message += `${chalk.yellow('Duration (avg.):', `${Number(durationAverage.toFixed(2))}ms`)}`;
      modernMessageTokens.push(
        `${style.aside('invocations')}: ${invocationsCount}`,
        `${style.aside('throttles')}: ${throttlesCount}`,
        `${style.aside('errors')}: ${errorsCount}`,
        `${style.aside('duration (avg.)')}: ${Number(durationAverage.toFixed(2))}ms`
      );
    } else {
      message += `${chalk.yellow('There are no metrics to show for these options')}`;
      modernMessageTokens.push('There are no metrics to show for these options');
    }

    legacy.consoleLog(message);
    writeText(modernMessageTokens);
  }
}

module.exports = AwsMetrics;
