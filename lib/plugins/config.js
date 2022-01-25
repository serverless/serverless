'use strict';

const config = require('@serverless/utils/config');
const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');
const isNpmPackageWritable = require('../utils/npm-package/is-writable');
const isNpmGlobalPackage = require('../utils/npm-package/is-global');
const renderCommandHelp = require('../cli/render-help/command');
const isLocallyInstalled = require('../cli/is-locally-installed');
const { log } = require('@serverless/utils/log');

// class wide constants
const validProviders = new Set(['aws']);

// TODO: update to look like the list in the "create" plugin
// once more than one provider is supported
const humanReadableProvidersList = `"${Array.from(validProviders)}"`;

const isWindows = process.platform === 'win32';
const noSupportErrorMessage = isWindows
  ? 'Auto update can only be set for "serverless" installed by npm globally'
  : 'Auto update can only be set for "serverless" installed by npm globally or ' +
    'standalone installation';

class Config {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      config: {
        ...cliCommandsSchema.get('config'),
        commands: {
          credentials: {
            // Command defined in AWS context
            validProviders,
          },
        },
      },
    };

    this.hooks = {
      'config:config': async () => this.updateConfig(),
      'before:config:credentials:config': () => this.validate(),
    };
  }

  validate() {
    const provider = this.options.provider.toLowerCase();

    if (!validProviders.has(provider)) {
      const errorMessage = [
        `Provider "${provider}" is not supported.`,
        ` Supported providers are: ${humanReadableProvidersList}.`,
      ].join('');
      throw new ServerlessError(errorMessage, 'INVALID_PROVIDER');
    }
  }

  async updateConfig() {
    if (this.options.autoupdate == null) {
      renderCommandHelp(this.serverless.processedInput.commands.join(' '));
      return;
    }
    if (this.options.autoupdate) {
      if (config.get('autoUpdate.enabled')) {
        log.notice.skip('Auto update is already turned on');
        return;
      }
      if (isLocallyInstalled) {
        throw new ServerlessError(noSupportErrorMessage, 'AUTO_UPDATE_NOT_SUPPORTED');
      }
      if (this.serverless.isStandaloneExecutable) {
        if (process.platform === 'win32') {
          throw new ServerlessError(noSupportErrorMessage, 'AUTO_UPDATE_NOT_SUPPORTED');
        }
      } else {
        if (!isNpmGlobalPackage()) {
          throw new ServerlessError(noSupportErrorMessage, 'AUTO_UPDATE_NOT_SUPPORTED');
        }
        if (!(await isNpmPackageWritable())) {
          throw new ServerlessError(
            'Auto update cannot be set, due to missing write access to npm global installation',
            'AUTO_UPDATE_NOT_SET_MISSING_WRITE_ACCESS'
          );
        }
      }
      config.set('autoUpdate.enabled', true);

      log.notice.success(
        'Auto update successfully turned on (Turn off at any time with "serverless config --no-autoupdate")'
      );
    } else {
      if (!config.get('autoUpdate.enabled')) {
        log.notice.skip('Auto update is already turned off');
        return;
      }
      config.set('autoUpdate.enabled', false);
      log.notice.success(
        'Auto update successfully turned off (Turn on at any time with "serverless config --autoupdate")'
      );
    }
  }
}

module.exports = Config;
