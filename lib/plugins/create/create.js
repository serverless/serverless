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
  'aws-scala-sbt',
  'plugin',
];

const humanReadableTemplateList = `${validTemplates.slice(0, -1)
  .map((template) => `"${template}"`).join(', ')} and "${validTemplates.slice(-1)}"`;

class Create {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      create: {
        usage: 'Create new Serverless service',
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
          name: {
            usage: 'Name for the service. Overwrites the default name of the created service.',
            shortcut: 'n',
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
    this.serverless.cli.log('Generating boilerplate…');
    const notPlugin = this.options.template !== 'plugin';

    if (validTemplates.indexOf(this.options.template) === -1) {
      const errorMessage = [
        `Template "${this.options.template}" is not supported.`,
        ` Supported templates are: ${humanReadableTemplateList}.`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    // store the custom options for the service if given
    const boilerplatePath = this.options
      .path && this.options.path.length ? this.options.path : null;
    const serviceName = this.options.name && this.options.name.length ? this.options.name : null;

    // create (if not yet present) and chdir into the directory for the service
    if (boilerplatePath) {
      const newPath = path.join(process.cwd(), boilerplatePath);

      this.serverless.cli.log(`Generating boilerplate in "${newPath}"`);

      fse.mkdirsSync(newPath);
      process.chdir(newPath);
    }

    if (notPlugin) this.serverless.config.update({ servicePath: process.cwd() });

    // copy template files recursively to cwd
    // while keeping template file tree
    try {
      this.serverless.utils.copyDirContentsSync(path.join(this.serverless.config.serverlessPath,
       'plugins', 'create', 'templates', this.options.template), process.cwd());
    } catch (err) {
      const errorMessage = [
        'Error unable to create a service in this directory. ',
        'Please check that you have the required permissions to write to the directory',
      ].join('');

      throw new this.serverless.classes.Error(errorMessage);
    }

    // rename the service if the user has provided a path via options and is creating a service
    if ((boilerplatePath || serviceName) && notPlugin) {
      const newServiceName = serviceName || boilerplatePath.split(path.sep).pop();
      const serverlessYmlFilePath = path
        .join(this.serverless.config.servicePath, 'serverless.yml');

      let serverlessYmlFileContent = fse
        .readFileSync(serverlessYmlFilePath).toString();

      serverlessYmlFileContent = serverlessYmlFileContent
        .replace(/service: .+/, `service: ${newServiceName}`);

      fse.writeFileSync(serverlessYmlFilePath, serverlessYmlFileContent);
    }

    this.serverless.cli.asciiGreeting();
    this.serverless.cli
      .log(`Successfully generated boilerplate for template: "${this.options.template}"`);

    if (!(boilerplatePath || serviceName) && notPlugin) {
      this.serverless.cli
        .log('NOTE: Please update the "service" property in serverless.yml with your service name');
    }

    return BbPromise.resolve();
  }

}

module.exports = Create;
