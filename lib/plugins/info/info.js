'use strict';

class Info {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      info: {
        usage: 'Displays information about the service.',
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
        },
      },
    };
  }
}

module.exports = Info;
