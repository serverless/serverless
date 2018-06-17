'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const _ = require('lodash');

const ServerlessError = require('../../classes/Error').ServerlessError;
const userStats = require('../../utils/userStats');
const download = require('../../utils/downloadTemplateFromRepo');
const renameService = require('../../utils/renameService').renameService;
const copyDirContentsSync = require('../../utils/fs/copyDirContentsSync');
const dirExistsSync = require('../../utils/fs/dirExistsSync');

// class wide constants
const validTemplates = [
  'aws-nodejs',
  'aws-nodejs-typescript',
  'aws-nodejs-ecma-script',
  'aws-python',
  'aws-python3',
  'aws-groovy-gradle',
  'aws-java-maven',
  'aws-java-gradle',
  'aws-kotlin-jvm-maven',
  'aws-kotlin-jvm-gradle',
  'aws-kotlin-nodejs-gradle',
  'aws-scala-sbt',
  'aws-csharp',
  'aws-fsharp',
  'aws-go',
  'aws-go-dep',
  'azure-nodejs',
  'fn-nodejs',
  'fn-go',
  'google-nodejs',
  'kubeless-python',
  'kubeless-nodejs',
  'openwhisk-java-maven',
  'openwhisk-nodejs',
  'openwhisk-php',
  'openwhisk-python',
  'openwhisk-swift',
  'spotinst-nodejs',
  'spotinst-python',
  'spotinst-ruby',
  'spotinst-java8',
  'webtasks-nodejs',
  'plugin',

  // this template is used to streamline the onboarding process
  // it uses the Node.js runtime and AWS provider
  'hello-world',
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
            shortcut: 't',
          },
          'template-url': {
            usage: 'Template URL for the service. Supports: GitHub, BitBucket',
            shortcut: 'u',
          },
          'template-path': {
            usage: 'Template local path for the service.',
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
    this.serverless.cli.log('Generating boilerplate...');

    if ('template' in this.options) {
      this.createFromTemplate();
    } else if ('template-url' in this.options) {
      return download.downloadTemplateFromRepo(
        this.options['template-url'],
        this.options.name,
        this.options.path
      )
        .then(dirName => {
          const message = [
            `Successfully installed "${dirName}" `,
            `${this.options.name && this.options.name !== dirName ? `as "${dirName}"` : ''}`,
          ].join('');

          this.serverless.cli.log(message);

          userStats.track('service_created', {
            template: this.options.template,
            serviceName: this.options.name,
          });
        })
        .catch(err => {
          throw new this.serverless.classes.Error(err);
        });
    } else if ('template-path' in this.options) {
      // Copying template from a local directory
      const servicePath = this.options.path || path.join(process.cwd(), this.options.name);
      if (dirExistsSync(servicePath)) {
        const errorMessage = `A folder named "${servicePath}" already exists.`;
        throw new ServerlessError(errorMessage);
      }
      copyDirContentsSync(this.options['template-path'], servicePath, {
        noLinks: true,
      });
      if (this.options.name) {
        renameService(this.options.name, servicePath);
      }
    } else {
      const errorMessage = [
        'You must either pass a template name (--template), ',
        'a URL (--template-url) or a local path (--template-path).',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return BbPromise.resolve();
  }

  createFromTemplate() {
    const notPlugin = this.options.template !== 'plugin';

    if (validTemplates.indexOf(this.options.template) === -1) {
      const errorMessage = [
        `Template "${this.options.template}" is not supported.`,
        ` Supported templates are: ${humanReadableTemplateList}.`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    // store the custom options for the service if given
    const boilerplatePath = _.toString(this.options.path);
    const serviceName = _.toString(this.options.name);
    const templateSrcDir = path.join(this.serverless.config.serverlessPath,
      'plugins', 'create', 'templates', this.options.template);

    // create (if not yet present) and chdir into the directory for the service
    if (boilerplatePath) {
      const newPath = path.join(process.cwd(), boilerplatePath);

      if (this.serverless.utils.dirExistsSync(newPath)) {
        const errorMessage = [
          `The directory "${newPath}" already exists, and serverless will not overwrite it. `,
          'Rename or move the directory and try again if you want serverless to create it"',
        ].join('');

        throw new this.serverless.classes.Error(errorMessage);
      }

      this.serverless.cli.log(`Generating boilerplate in "${newPath}"`);

      fse.mkdirsSync(newPath);
      process.chdir(newPath);
    } else {
      // ensure no template file already exists in cwd that we may overwrite
      const templateFullFilePaths = this.serverless.utils.walkDirSync(templateSrcDir);

      templateFullFilePaths.forEach(ffp => {
        const filename = path.basename(ffp);
        if (this.serverless.utils.fileExistsSync(path.join(process.cwd(), filename))) {
          const errorMessage = [
            `The file "${filename}" already exists, and serverless will not overwrite it. `,
            `Move the file and try again if you want serverless to write a new "${filename}"`,
          ].join('');

          throw new this.serverless.classes.Error(errorMessage);
        }
      });
    }

    if (notPlugin) {
      this.serverless.config.update({ servicePath: process.cwd() });
    }

    // copy template files recursively to cwd
    // while keeping template file tree
    try {
      this.serverless.utils.copyDirContentsSync(templateSrcDir, process.cwd());

      // NPM renames .gitignore to .npmignore on publish so we have to rename it.
      if (fse.existsSync(path.join(process.cwd(), 'gitignore'))) {
        fse.renameSync(path.join(process.cwd(), 'gitignore'),
          path.join(process.cwd(), '.gitignore'));
      }
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

    userStats.track('service_created', {
      template: this.options.template,
      serviceName,
    });

    this.serverless.cli.asciiGreeting();
    this.serverless.cli
      .log(`Successfully generated boilerplate for template: "${this.options.template}"`);

    if (!(boilerplatePath || serviceName) && notPlugin) {
      this.serverless.cli
        .log('NOTE: Please update the "service" property in serverless.yml with your service name');
    }
  }

}

module.exports = Create;
