'use strict';

const config = require('@serverless/utils/config');
const BbPromise = require('bluebird');

class SlStats {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      slstats: {
        usage: 'Enable or disable stats',
        configDependent: true,
        lifecycleEvents: ['slstats'],
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
    return BbPromise.try(() => {
      const enableStats = this.options.enable && !this.options.disable;
      const disabledStats = this.options.disable && !this.options.enable;
      if (enableStats) {
        try {
          // set .serverlessrc config
          config.set('trackingDisabled', false);
          this.serverless.cli.log('Stats successfully enabled');
        } catch (error) {
          const message = error;
          throw new Error(`Enabling / Disabling of statistics failed: ${message}`);
        }
      } else if (disabledStats) {
        try {
          // set .serverlessrc config
          config.set('trackingDisabled', true);
          this.serverless.cli.log('Stats successfully disabled');
        } catch (error) {
          const message = error;
          throw new Error(`Enabling / Disabling of statistics failed: ${message}`);
        }
      }
    });
  }
}

module.exports = SlStats;
