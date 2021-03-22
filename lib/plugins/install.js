'use strict';

const BbPromise = require('bluebird');

const cliCommandsSchema = require('../cli/commands-schema');
const download = require('../utils/downloadTemplateFromRepo');

class Install {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      install: {
        ...cliCommandsSchema.get('install'),
      },
    };

    this.hooks = {
      'install:install': async () => BbPromise.bind(this).then(this.install),
    };
  }

  async install() {
    return download
      .downloadTemplateFromRepo(this.options.url, this.options.name)
      .then((serviceName) => {
        const message = [
          `Successfully installed "${serviceName}" `,
          `${
            this.options.name && this.options.name !== serviceName
              ? `as "${this.options.name}"`
              : ''
          }`,
        ].join('');

        this.serverless.cli.log(message);
      });
  }
}

module.exports = Install;
