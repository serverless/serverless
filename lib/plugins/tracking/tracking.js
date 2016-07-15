'use strict';

const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

class Tracking {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      tracking: {
        usage: 'Enable or disable usage tracking.',
        lifecycleEvents: [
          'tracking',
        ],
        options: {
          enable: {
            usage: 'Enable tracking ("--enable")',
            shortcut: 'e',
          },
          disable: {
            usage: 'Disable tracking ("--disable")',
            shortcut: 'd',
          },
        },
      },
    };

    this.hooks = {
      'tracking:tracking': this.toggleTracking.bind(this),
    };
  }

  toggleTracking() {
    const serverlessPath = this.serverless.config.serverlessPath;
    const trackingFileName = 'do-not-track';

    if (this.options.enable && !this.options.disable) {
      fse.removeSync(path.join(serverlessPath, trackingFileName));
      this.serverless.cli.log('Tracking successfully enabled');
    }
    if (this.options.disable && !this.options.enable) {
      fs.writeFileSync(path.join(serverlessPath, trackingFileName),
        'Keep this file to enable tracking');
      this.serverless.cli.log('Tracking successfully disabled');
    }
  }
}

module.exports = Tracking;
