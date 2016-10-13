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
    const statsDisabledFilePath = path.join(serverlessDirPath, 'stats-disabled');
    const statsEnabledFilePath = path.join(serverlessDirPath, 'stats-enabled');

    if (this.options.enable && !this.options.disable) {
      if (this.serverless.utils.fileExistsSync(statsDisabledFilePath)) {
        fse.renameSync(statsDisabledFilePath, statsEnabledFilePath);
      }
      this.serverless.cli.log('Stats successfully enabled');
    }
    if (this.options.disable && !this.options.enable) {
      if (this.serverless.utils.fileExistsSync(statsEnabledFilePath)) {
        fse.renameSync(statsEnabledFilePath, statsDisabledFilePath);
      }
      this.serverless.cli.log('Stats successfully disabled');
    }
  }
}

module.exports = SlStats;
