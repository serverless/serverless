'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');

// class wide constants
const validTemplates = [
  'aws-nodejs',
  'aws-python',
  'aws-java-maven',
  'aws-java-gradle',
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
          path: {
            usage: 'The path where the service should be created (e.g. --path my-service)',
            shortcut: 'p',
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

    if (this.options.path && this.options.path.length > 0) {
      const newPath = path.join(process.cwd(), this.options.path);

      this.serverless.cli.log(`Creating the service in "${newPath}"`);

      fse.mkdirsSync(newPath);
      process.chdir(newPath);
    }

    this.serverless.config.update({ servicePath: process.cwd() });

    // copy template files recursively to cwd
    // while keeping template file tree
    this.serverless.utils.copyDirContentsSync(path.join(this.serverless.config.serverlessPath,
      'plugins', 'create', 'templates', this.options.template), this.serverless.config.servicePath);

    this.serverless.cli.asciiGreeting();
    this.serverless.cli
      .log('Successfully created service');
    this.serverless.cli
      .log(`with template: "${this.options.template}"`);

    this.serverless.cli
      .log('NOTE: Please update the "service" property in serverless.yml with your service name');

    return BbPromise.resolve();
  }

}

module.exports = Create;
