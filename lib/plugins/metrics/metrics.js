'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../utils/userStats');

class Metrics {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      metrics: {
        usage: 'Show metrics for a specific function',
        configDependent: true,
        lifecycleEvents: ['metrics'],
        options: {
          function: {
            usage: 'The function name',
            shortcut: 'f',
          },
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          startTime: {
            usage: 'Start time for the metrics retrieval (e.g. 1970-01-01)',
          },
          endTime: {
            usage: 'End time for the metrics retrieval (e.g. 1970-01-01)',
          },
        },
      },
    };

    this.hooks = {
      'after:metrics:metrics': () => BbPromise.bind(this).then(this.track),
    };
  }

  track() {
    // todo would like to see time frame via --startTime
    userStats.track('service_metricsViewed');
    return BbPromise.resolve();
  }
}

module.exports = Metrics;
