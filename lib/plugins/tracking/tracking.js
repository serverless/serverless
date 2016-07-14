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
          enabled: {
            usage: 'enabled ("yes" or "no")',
            shortcut: 'e',
            required: true,
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

    this.options.enabled = this.options.enabled.toLowerCase();

    if (this.options.enabled === 'yes') {
      fse.removeSync(path.join(serverlessPath, trackingFileName));
    } else if (this.options.enabled === 'no') {
      fs.writeFileSync(path.join(serverlessPath, trackingFileName),
        'Keep this file to enable tracking');
    }
  }
}

module.exports = Tracking;
