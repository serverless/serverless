'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../utils/userStats');

class Info {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      info: {
        usage: 'Display information about the service',
        lifecycleEvents: [
          'info',
        ],
        options: {
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          verbose: {
            usage: 'Display Stack output',
            shortcut: 'v',
          },
        },
      },
    };

    this.hooks = {
      'after:info:info': () => BbPromise.bind(this).then(this.track),
    };
  }

  track() {
    userStats.track('service_infoViewed');
    return BbPromise.resolve();
  }
}

module.exports = Info;
