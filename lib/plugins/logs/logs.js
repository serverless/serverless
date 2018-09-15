'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../utils/userStats');

class Logs {
  constructor(serverless) {
    this.serverless = serverless;
    this.userStats = userStats;

    this.commands = {
      logs: {
        usage: 'Output the logs of a deployed function',
        lifecycleEvents: [
          'logs',
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
          tail: {
            usage: 'Tail the log output',
            shortcut: 't',
          },
          startTime: {
            usage: 'Logs before this time will not be displayed',
          },
          filter: {
            usage: 'A filter pattern',
          },
          interval: {
            usage: 'Tail polling interval in milliseconds. Default: `1000`',
            shortcut: 'i',
          },
        },
      },
    };

    this.hooks = {
      'after:logs:logs': () => BbPromise.bind(this).then(this.track),
    };
  }

  track() {
    const sls = this.serverless;
    if (sls && sls.processedInput && sls.processedInput.options) {
      const opts = sls.processedInput.options;
      const type = (opts.tail) ? 'service_logsTailed' : 'service_logsViewed';
      this.userStats.track(type);
    }
    return BbPromise.resolve();
  }
}

module.exports = Logs;
