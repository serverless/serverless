'use strict';

const BbPromise = require('bluebird');

module.exports = {
  getMetrics() {
    const info = this.gatheredData.info;

    if (info.functions && info.functions.length > 0) {
      return BbPromise.map(info.functions, (func) => {
        // global configs for metric retrieval
        const today = new Date();
        let yesterday = new Date();
        yesterday = yesterday.setDate(yesterday.getDate() - 1); // subtract one day
        yesterday = new Date(yesterday); // pass it back into a Date object to be used with for AWS
        const period = 60 * 60 * 24; // granularity in seconds for the data points (1 day)
        const namespace = 'AWS/Lambda';

        const promises = [];

        // get invocations
        const invocationsPromise = this.provider.request('CloudWatch',
          'getMetricStatistics',
          {
            StartTime: yesterday,
            EndTime: today,
            MetricName: 'Invocations',
            Namespace: namespace,
            Period: period,
            Dimensions: [
              {
                Name: 'FunctionName',
                Value: func.name,
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
            StartTime: yesterday,
            EndTime: today,
            MetricName: 'Throttles',
            Namespace: namespace,
            Period: period,
            Dimensions: [
              {
                Name: 'FunctionName',
                Value: func.name,
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
            StartTime: yesterday,
            EndTime: today,
            MetricName: 'Errors',
            Namespace: namespace,
            Period: period,
            Dimensions: [
              {
                Name: 'FunctionName',
                Value: func.name,
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
            StartTime: yesterday,
            EndTime: today,
            MetricName: 'Duration',
            Namespace: namespace,
            Period: period,
            Dimensions: [
              {
                Name: 'FunctionName',
                Value: func.name,
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

        return BbPromise.all(promises).then((metrics) => {
          const enrichedFuncObject = func;
          enrichedFuncObject.metrics = metrics;
          return enrichedFuncObject;
        });
      }).then(() => BbPromise.resolve());
    }

    return BbPromise.resolve();
  },
};
