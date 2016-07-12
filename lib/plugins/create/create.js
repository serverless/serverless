'use strict';

const BbPromise = require('bluebird');
const path = require('path');

class Create {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      create: {
        usage: 'create new Serverless Service.',
        lifecycleEvents: [
          'create',
        ],
        options: {
          template: {
            usage: 'Template for the service. Available templates: aws-nodejs',
            required: true,
            shortcut: 't',
          },
        },
      },
    };

    this.hooks = {
      'create:create': () => BbPromise.bind(this)
        .then(this.create),
    };
  }

  create() {
    this.serverless.cli.log('Creating new Serverless service...');

    const validTemplates = [
      'aws-nodejs',
    ];

    if (validTemplates.indexOf(this.options.template)) {
      const errorMessage = [
        `Template "${this.options.template}" is not supported.`,
        ' Supported templates are: aws-nodejs.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    this.serverless.config.update({ servicePath: process.cwd() });

    // copy template files recursively to cwd
    // while keeping template file tree
    this.serverless.utils.copyDirContentsSync(path.join(this.serverless.config.serverlessPath,
      'plugins', 'create', 'templates', this.options.template), this.serverless.config.servicePath);

    this.serverless.cli
      .log('Successfully created service in the current directory');
    this.serverless.cli
      .log(`with template: "${this.options.template}"`);

    return BbPromise.resolve();
  }

}

module.exports = Create;
