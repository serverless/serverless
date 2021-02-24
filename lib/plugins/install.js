'use strict';

const download = require('../utils/downloadTemplateFromRepo');

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
      'install:install': async () => this.install(),
    };
  }

  async install() {
    const serviceName = await download.downloadTemplateFromRepo(
      this.options.url,
      this.options.name
    );
    const message = [
      `Successfully installed "${serviceName}" `,
      `${
        this.options.name && this.options.name !== serviceName ? `as "${this.options.name}"` : ''
      }`,
    ].join('');

    this.serverless.cli.log(message);
  }
}

module.exports = Install;
