'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../utils/userStats');
const validate = require('../lib/validate');

class Remove {
  constructor(serverless) {
    this.serverless = serverless;

    Object.assign(
      this,
      validate
    );

    this.commands = {
      remove: {
        usage: 'Remove Serverless service and all resources',
        lifecycleEvents: [
          'remove',
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
            usage: 'Show all stack events during deployment',
            shortcut: 'v',
          },
        },
      },
    };

    this.hooks = {
      'before:remove:remove': () => BbPromise.bind(this).then(this.validate),
      'after:remove:remove': () => BbPromise.bind(this).then(this.track),
    };
  }

  track() {
    userStats.track('service_removed');
    return BbPromise.resolve();
  }
}

module.exports = Remove;
