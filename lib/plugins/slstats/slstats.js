'use strict';

const path = require('path');
const fse = require('fs-extra');
const os = require('os');

class SlStats {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      slstats: {
        usage: 'Enable or disable stats',
        lifecycleEvents: [
          'slstats',
        ],
        options: {
          enable: {
            usage: 'Enable stats ("--enable")',
            shortcut: 'e',
          },
          disable: {
            usage: 'Disable stats ("--disable")',
            shortcut: 'd',
          },
        },
      },
    };

    this.hooks = {
      'slstats:slstats': this.toggleStats.bind(this),
    };
  }

  toggleStats() {
    const serverlessDirPath = path.join(os.homedir(), '.serverless');
    const statsFileName = 'stats-disabled';

    if (this.options.enable && !this.options.disable) {
      fse.removeSync(path.join(serverlessDirPath, statsFileName));
      this.serverless.cli.log('Stats successfully enabled');
    }
    if (this.options.disable && !this.options.enable) {
      this.serverless.utils.writeFileSync(
        path.join(serverlessDirPath, statsFileName),
        'Keep this file to disable stats');
      this.serverless.cli.log('Stats successfully disabled');
    }
  }
}

module.exports = SlStats;
