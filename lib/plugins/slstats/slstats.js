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

  createStatsFile(oldPath, newPath) {
    const oldFileExists = this.serverless.utils.fileExistsSync(oldPath);
    const newFileExists = this.serverless.utils.fileExistsSync(newPath);
    const isFileToBeRenamed = !newFileExists && oldFileExists;
    const isFileToBeCreated = !newFileExists;
    if (isFileToBeRenamed) {
      fse.renameSync(oldPath, newPath);
    } else if (isFileToBeCreated) {
      this.serverless.utils.writeFileSync(newPath);
    }
  }

  toggleStats() {
    try {
      const serverlessDirPath = path.join(os.homedir(), '.serverless');
      const statsDisabledFilePath = path.join(serverlessDirPath, 'stats-disabled');
      const statsEnabledFilePath = path.join(serverlessDirPath, 'stats-enabled');
      const isStatsEnabled = this.options.enable && !this.options.disable;
      const isStatsDisabled = this.options.disable && !this.options.enable;
      if (isStatsEnabled) {
        this.createStatsFile(statsDisabledFilePath, statsEnabledFilePath);
        this.serverless.cli.log('Stats successfully enabled');
      } else if (isStatsDisabled) {
        this.createStatsFile(statsEnabledFilePath, statsDisabledFilePath);
        this.serverless.cli.log('Stats successfully disabled');
      }
    } catch (error) {
      throw new this.serverless.classes
      .Error(`Enabling / Disabling of statistics failed: ${error.message}`);
    }
  }
}

module.exports = SlStats;
