'use strict';

class Metrics {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      metrics: {
        usage: 'Show metrics for a specific function',
        lifecycleEvents: [
          'metrics',
        ],
        options: {
          function: {
            usage: 'The function name',
            required: true,
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
            usage: 'Start time for the metrics retrieval',
          },
          endTime: {
            usage: 'End time for the metrics retrieval',
          },
        },
      },
    };
  }
}

module.exports = Metrics;
