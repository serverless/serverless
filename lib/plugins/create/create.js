'use strict';

const BbPromise = require('bluebird');
const path = require('path');

// class wide constants
const validTemplates = [
  'aws-nodejs',
  'aws-python',
];

const humanReadableTemplateList = `${validTemplates.slice(0, -1)
  .map((template) => `"${template}"`).join(', ')} and "${validTemplates.slice(-1)}"`;

class Create {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      create: {
        usage: 'Create new Serverless Service.',
        lifecycleEvents: [
          'create',
        ],
        options: {
          template: {
            usage: `Template for the service. Available templates: ${humanReadableTemplateList}`,
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

    if (validTemplates.indexOf(this.options.template) === -1) {
      const errorMessage = [
        `Template "${this.options.template}" is not supported.`,
        ` Supported templates are: ${humanReadableTemplateList}.`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    this.serverless.config.update({ servicePath: process.cwd() });

    // copy template files recursively to cwd
    // while keeping template file tree
    this.serverless.utils.copyDirContentsSync(path.join(this.serverless.config.serverlessPath,
      'plugins', 'create', 'templates', this.options.template), this.serverless.config.servicePath);

    this.serverless.cli.asciiGreeting();
    this.serverless.cli
      .log('Successfully created service in the current directory');
    this.serverless.cli
      .log(`with template: "${this.options.template}"`);

    return BbPromise.resolve();
  }

}

module.exports = Create;
