'use strict';

const BbPromise = require('bluebird');
const isTabTabCompletionSupported = require('../../utils/tabCompletion/isSupported');
const muteConsoleLog = require('../../utils/log/muteConsoleLog');
const userStats = require('../../utils/userStats');
const tabtabOptions = require('../../utils/tabCompletion/tabtabOptions');

// class wide constants
const validProviders = new Set(['aws']);
const validShells = new Set(['bash', 'zsh', 'fish']);

// TODO: update to look like the list in the "create" plugin
// once more than one provider is supported
const humanReadableProvidersList = `"${Array.from(validProviders)}"`;

class Config {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      config: {
        usage: 'Configure Serverless',
        configDependent: false,
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
      'before:config:credentials:config': () => this.validate(),
      'after:config:credentials:config': () => this.track(),
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

  track() {
    const opts = this.serverless.processedInput.options;
    if (opts.provider === 'aws') userStats.track('user_awsCredentialsConfigured');
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
