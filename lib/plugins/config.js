'use strict';

const BbPromise = require('bluebird');
const config = require('@serverless/utils/config');
const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');
const muteConsoleLog = require('../utils/log/muteConsoleLog');
const tabtabOptions = require('../utils/tabCompletion/tabtabOptions');
const isNpmPackageWritable = require('../utils/npmPackage/isWritable');
const isNpmGlobalPackage = require('../utils/npmPackage/isGlobal');
const renderCommandHelp = require('../cli/render-help/command');
const { legacy, log } = require('@serverless/utils/log');

// class wide constants
const validProviders = new Set(['aws']);
const validShells = new Set(['bash', 'zsh', 'fish']);

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

    this.commands.config.commands.tabcompletion = {
      type: 'container',
      commands: {
        install: {
          ...cliCommandsSchema.get('config tabcompletion install'),
        },
        uninstall: {
          ...cliCommandsSchema.get('config tabcompletion uninstall'),
        },
      },
    };

    this.hooks = {
      'config:config': async () => this.updateConfig(),
      'before:config:credentials:config': () => this.validate(),
      'config:tabcompletion:install:install': async () => this.tabtabCompletionInstall(),
      'config:tabcompletion:uninstall:uninstall': async () => this.tabtabCompletionUninstall(),
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
        legacy.log('Auto update is already turned on');
        log.notice.skip('Auto update is already turned on');
        return;
      }
      if (this.serverless.isLocallyInstalled) {
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

      legacy.log(
        'Auto update successfully turned on (Turn off at any time with "serverless config --no-autoupdate")'
      );
      log.notice.success(
        'Auto update successfully turned on (Turn off at any time with "serverless config --no-autoupdate")'
      );
    } else {
      if (!config.get('autoUpdate.enabled')) {
        legacy.log('Auto update is already turned off');
        log.notice.skip('Auto update is already turned off');
        return;
      }
      config.set('autoUpdate.enabled', false);
      legacy.log(
        'Auto update successfully turned off (Turn on at any time with "serverless config --autoupdate")'
      );
      log.notice.success(
        'Auto update successfully turned off (Turn on at any time with "serverless config --autoupdate")'
      );
    }
  }

  async tabtabCompletionInstall() {
    return BbPromise.try(() => {
      const shell = this.serverless.processedInput.options.shell || 'bash';

      if (!validShells.has(shell)) {
        throw new ServerlessError(
          `Shell "${shell}" is not supported. Supported shells: ${Array.from(validShells)}.`,
          'TABCOMPLETION_INVALID_SHELL_ARGUMENT'
        );
      }
      const location = (() => {
        if (this.serverless.processedInput.options.location) {
          return this.serverless.processedInput.options.location;
        }
        const { BASH_LOCATION, FISH_LOCATION, ZSH_LOCATION } = require('tabtab/lib/constants');
        switch (shell) {
          case 'bash':
            return BASH_LOCATION;
          case 'zsh':
            return ZSH_LOCATION;
          case 'fish':
            return FISH_LOCATION;
          default:
            throw new Error('Unexpected shell choice');
        }
      })();
      const { install } = require('tabtab/lib/installer');
      return muteConsoleLog(() =>
        tabtabOptions.reduce(
          (previousOperation, options) =>
            previousOperation.then(() => install(Object.assign({ location }, options))),
          BbPromise.resolve()
        )
      ).then(() => {
        legacy.log(`Tab autocompletion setup for ${shell}. Make sure to reload your SHELL.`);
        log.notice.success(
          `Tab autocompletion setup for ${shell}. Make sure to reload your SHELL.`
        );
      });
    });
  }

  async tabtabCompletionUninstall() {
    return BbPromise.try(() => {
      const { uninstall } = require('tabtab/lib/installer');
      return muteConsoleLog(() =>
        tabtabOptions.reduce(
          (previousOperation, options) => previousOperation.then(() => uninstall(options)),
          BbPromise.resolve()
        )
      ).then(() => {
        legacy.log('Tab autocompletion uninstalled (for all configured shells).');
        log.notice.success('Tab autocompletion uninstalled (for all configured shells).');
      });
    });
  }
}

module.exports = Config;
