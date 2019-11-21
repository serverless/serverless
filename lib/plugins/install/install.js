'use strict';

const BbPromise = require('bluebird');

const userStats = require('../../utils/userStats');
const download = require('../../utils/downloadTemplateFromRepo');

class Install {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      install: {
        usage: 'Install a Serverless service from GitHub or a plugin from the Serverless registry',
        lifecycleEvents: ['install'],
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
      'install:install': () => BbPromise.bind(this).then(this.install),
    };
  }

  install() {
    return download
      .downloadTemplateFromRepo(this.options.url, this.options.name)
      .then(serviceName => {
        const message = [
          `Successfully installed "${serviceName}" `,
          `${
            this.options.name && this.options.name !== serviceName
              ? `as "${this.options.name}"`
              : ''
          }`,
        ].join('');
        userStats.track('service_installed', {
          data: {
            // will be updated with core analytics lib
            url: this.options.url,
          },
        });

        this.serverless.cli.log(message);
      });
  }
}

module.exports = Install;
