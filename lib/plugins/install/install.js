'use strict';

const BbPromise = require('bluebird');

const userStats = require('../../utils/userStats');
const downloadTemplateFromRepo = require('../../utils/downloadTemplateFromRepo')
  .downloadTemplateFromRepo;

class Install {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      install: {
        usage: 'Install a Serverless service from GitHub or a plugin from the Serverless registry',
        lifecycleEvents: [
          'install',
        ],
        options: {
          url: {
            usage: 'URL of the Serverless service on GitHub',
            required: true,
            shortcut: 'u',
          },
          name: {
            usage: 'Name for the service',
            shortcut: 'n',
          },
        },
      },
    };

    this.hooks = {
      'install:install': () => BbPromise.bind(this)
        .then(this.install),
    };
  }

  install() {
    return downloadTemplateFromRepo(this.options.url, this.options.name)
      .then(dirName => {
        const message = [
          `Successfully installed "${dirName}" `,
          `${this.options.name && this.options.name !== dirName ? `as "${dirName}"` : ''}`,
        ].join('');
        userStats.track('service_installed', {
          data: { // will be updated with core analtyics lib
            url: this.options.url,
          },
        });

        this.serverless.cli.log(message);
      });
  }
}

module.exports = Install;
