'use strict';

const BbPromise = require('bluebird');
const config = require('@serverless/utils/config');
const isTabTabCompletionSupported = require('../../utils/tabCompletion/isSupported');
const muteConsoleLog = require('../../utils/log/muteConsoleLog');
const tabtabOptions = require('../../utils/tabCompletion/tabtabOptions');
const isNpmPackageWritable = require('../../utils/npmPackage/isWritable');
const isNpmGlobalPackage = require('../../utils/npmPackage/isGlobal');

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
        usage: 'Configure Serverless',
        configDependent: false,
        lifecycleEvents: ['config'],
        options: {
          autoupdate: {
            usage: 'Turn on auto update mechanism (turn off via "--no-autoupdate")',
          },
        },
        commands: {
          credentials: {
            usage: 'Configures a new provider profile for the Serverless Framework',
            lifecycleEvents: ['config'],
            validProviders,
            options: {
              provider: {
                usage: `Name of the provider. Supported providers: ${humanReadableProvidersList}`,
                required: true,
                shortcut: 'p',
              },
            },
          },
        },
      },
    };

    if (isTabTabCompletionSupported) {
      this.commands.config.commands.tabcompletion = {
        usage: 'Configure command line <tab> completion',
        commands: {
          install: {
            usage: 'Install a <tab> completion for chosen shell',
            lifecycleEvents: ['install'],
            options: {
              shell: {
                usage:
                  'Shell for which <tab> completion should be installed. ' +
                  'Supported options: bash (default), zsh, fish ',
                shortcut: 's',
              },
              location: {
                usage: 'Custom location for shell config',
                shortcut: 'l',
              },
            },
          },
          uninstall: {
            usage: 'Uninstall a <tab> completion for chosen shell',
            lifecycleEvents: ['uninstall'],
          },
        },
      };
    }

    this.hooks = {
      'config:config': () => this.updateConfig(),
      'before:config:credentials:config': () => this.validate(),
      'config:tabcompletion:install:install': () => this.tabtabCompletionInstall(),
      'config:tabcompletion:uninstall:uninstall': () => this.tabtabCompletionUninstall(),
    };
  }

  validate() {
    const provider = this.options.provider.toLowerCase();

    if (!validProviders.has(provider)) {
      const errorMessage = [
        `Provider "${provider}" is not supported.`,
        ` Supported providers are: ${humanReadableProvidersList}.`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
  }

  async updateConfig() {
    if (this.options.autoupdate == null) {
      this.serverless.cli.generateCommandsHelp(this.serverless.processedInput.commands);
      return;
    }
    if (this.options.autoupdate) {
      if (config.get('autoUpdate.enabled')) {
        this.serverless.cli.log('Auto update is already turned on');
        return;
      }
      if (this.serverless.isLocallyInstalled) {
        throw new this.serverless.classes.Error(noSupportErrorMessage);
      }
      if (this.serverless.isStandaloneExecutable) {
        if (process.platform === 'win32') {
          throw new this.serverless.classes.Error(noSupportErrorMessage);
        }
      } else {
        if (!(await isNpmGlobalPackage())) {
          throw new this.serverless.classes.Error(noSupportErrorMessage);
        }
        if (!(await isNpmPackageWritable(this.serverless))) {
          throw new this.serverless.classes.Error(
            'Auto update cannot be set, due to missing write access to npm global installation'
          );
        }
      }
      config.set('autoUpdate.enabled', true);

      this.serverless.cli.log(
        'Auto update successfully turned on (Turn off at any time with "serverless config --no-autoupdate")'
      );
    } else {
      if (!config.get('autoUpdate.enabled')) {
        this.serverless.cli.log('Auto update is already turned off');
        return;
      }
      config.set('autoUpdate.enabled', false);
      this.serverless.cli.log(
        'Auto update successfully turned off (Turn on at any time with "serverless config --autoupdate")'
      );
    }
  }

  tabtabCompletionInstall() {
    return BbPromise.try(() => {
      const shell = this.serverless.processedInput.options.shell || 'bash';

      if (!validShells.has(shell)) {
        throw new this.serverless.classes.Error(
          `Shell "${shell}" is not supported. Supported shells: ${Array.from(validShells)}.`
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
      ).then(() =>
        this.serverless.cli.log(
          `Tab autocompletion setup for ${shell}. Make sure to reload your SHELL.`
        )
      );
    });
  }

  tabtabCompletionUninstall() {
    return BbPromise.try(() => {
      const { uninstall } = require('tabtab/lib/installer');
      return muteConsoleLog(() =>
        tabtabOptions.reduce(
          (previousOperation, options) => previousOperation.then(() => uninstall(options)),
          BbPromise.resolve()
        )
      ).then(() =>
        this.serverless.cli.log('Tab autocompletion uninstalled (for all configured shells).')
      );
    });
  }
}

module.exports = Config;
