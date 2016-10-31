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

    try {
      if (this.options.enable && !this.options.disable) {
        if (fse.lstatSync(statsDisabledFilePath).isFile()) {
          fse.renameSync(statsDisabledFilePath, statsEnabledFilePath);
        }
        this.serverless.cli.log('Stats successfully enabled');
      }
      if (this.options.disable && !this.options.enable) {
        if (fse.lstatSync(statsEnabledFilePath).isFile()) {
          fse.renameSync(statsEnabledFilePath, statsDisabledFilePath);
        }
        this.serverless.cli.log('Stats successfully disabled');
      }
    } catch (e) {
      throw new this.serverless.classes
      .Error(`slstats failed. The following message: ${e.message}`);
    }
  }
}

module.exports = SlStats;
