'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const _ = require('lodash');
const untildify = require('untildify');

const ServerlessError = require('../../classes/Error').ServerlessError;
const createFromTemplate = require('../../utils/createFromTemplate');
const userStats = require('../../utils/userStats');
const download = require('../../utils/downloadTemplateFromRepo');
const renameService = require('../../utils/renameService').renameService;
const copyDirContentsSync = require('../../utils/fs/copyDirContentsSync');
const dirExistsSync = require('../../utils/fs/dirExistsSync');

// class wide constants
const validTemplates = [
  'aws-clojure-gradle',
  'aws-clojurescript-gradle',
  'aws-nodejs',
  'aws-nodejs-typescript',
  'aws-alexa-typescript',
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
  'aws-go-mod',
  'aws-ruby',
  'aws-provided',
  'tencent-go',
  'tencent-nodejs',
  'tencent-python',
  'tencent-php',
  'azure-nodejs',
  'cloudflare-workers',
  'cloudflare-workers-enterprise',
  'cloudflare-workers-rust',
  'fn-nodejs',
  'fn-go',
  'google-nodejs',
  'google-python',
  'google-go',
  'kubeless-python',
  'kubeless-nodejs',
  'openwhisk-java-maven',
  'openwhisk-nodejs',
  'openwhisk-php',
  'openwhisk-python',
  'openwhisk-ruby',
  'openwhisk-swift',
  'spotinst-nodejs',
  'spotinst-python',
  'spotinst-ruby',
  'spotinst-java8',
  'twilio-nodejs',
  'aliyun-nodejs',
  'plugin',

  // this template is used to streamline the onboarding process
  // it uses the Node.js runtime and AWS provider
  'hello-world',
];

const humanReadableTemplateList = (() => {
  let lastGroupName = null;
  let result = '';
  let lineCount = 0;
  const templateGroupRe = /^([a-z0-9]+)(-|$)/;
  for (const templateName of validTemplates) {
    const groupName = templateName.match(templateGroupRe)[1];
    if (groupName !== lastGroupName || lineCount === 8) {
      result += `\n${' '.repeat(45)}"${templateName}"`;
      lastGroupName = groupName;
      lineCount = 1;
    } else {
      result += `, "${templateName}"`;
      ++lineCount;
    }
  }
  return result;
})();

const handleServiceCreationError = error => {
  if (error.code !== 'EACCESS') throw error;
  const errorMessage = [
    'Error unable to create a service in this directory. ',
    'Please check that you have the required permissions to write to the directory',
  ].join('');

  throw new this.serverless.classes.Error(errorMessage);
};

class Create {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      create: {
        usage: 'Create new Serverless service',
        lifecycleEvents: ['create'],
        options: {
          'template': {
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
          'path': {
            usage: 'The path where the service should be created (e.g. --path my-service)',
            shortcut: 'p',
          },
          'name': {
            usage: 'Name for the service. Overwrites the default name of the created service.',
            shortcut: 'n',
          },
        },
      },
    };

    this.hooks = {
      'create:create': () => BbPromise.bind(this).then(this.create),
    };
  }

  create() {
    this.serverless.cli.log('Generating boilerplate...');

    if ('template' in this.options) {
      return this.createFromTemplate();
    } else if ('template-url' in this.options) {
      return download
        .downloadTemplateFromRepo(
          this.options['template-url'],
          this.options.name,
          this.options.path
        )
        .then(serviceName => {
          const message = [
            `Successfully installed "${serviceName}" `,
            `${
              this.options.name && this.options.name !== serviceName
                ? `as "${this.options.name}"`
                : ''
            }`,
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
      const servicePath = this.options.path
        ? untildify(this.options.path)
        : path.join(process.cwd(), this.options.name);
      if (dirExistsSync(servicePath)) {
        const errorMessage = `A folder named "${servicePath}" already exists.`;
        throw new ServerlessError(errorMessage);
      }
      copyDirContentsSync(untildify(this.options['template-path']), servicePath, {
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
    const templateSrcDir = path.join(
      this.serverless.config.serverlessPath,
      'plugins',
      'create',
      'templates',
      this.options.template
    );

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

    if (!notPlugin) {
      return BbPromise.try(() => {
        try {
          fse.copySync(
            path.join(__dirname, '../../../lib/plugins/create/templates', this.options.template),
            process.cwd()
          );
        } catch (error) {
          handleServiceCreationError(error);
        }
      });
    }

    this.serverless.config.update({ servicePath: process.cwd() });

    return createFromTemplate(this.options.template, process.cwd(), { name: serviceName }).then(
      () => {
        userStats.track('service_created', {
          template: this.options.template,
          serviceName,
        });

        this.serverless.cli.asciiGreeting();
        this.serverless.cli.log(
          `Successfully generated boilerplate for template: "${this.options.template}"`
        );

        if (!(boilerplatePath || serviceName) && notPlugin) {
          this.serverless.cli.log(
            'NOTE: Please update the "service" property in serverless.yml with your service name'
          );
        }
      },
      handleServiceCreationError
    );
  }
}

module.exports = Create;
