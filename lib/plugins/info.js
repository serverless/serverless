'use strict';

class Info {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      info: {
        usage: 'Display information about the service',
        configDependent: true,
        lifecycleEvents: ['info'],
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
  }
}

module.exports = Info;
