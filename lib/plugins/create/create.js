'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const ejs = require('ejs');
const yamlEdit = require('yaml-edit');

// class wide constants
const validTemplates = [
  'aws-nodejs',
  'aws-python',
  'aws-java-maven',
  'aws-java-gradle',
  'aws-scala-sbt',
  'plugin',
];

const validFunctionRuntimes = [
  'aws-nodejs4.3',
];

const humanReadableTemplateList = `${validTemplates.slice(0, -1)
  .map((template) => `"${template}"`).join(', ')} and "${validTemplates.slice(-1)}"`;

const humanReadableFunctionRuntimes = `${validFunctionRuntimes
  .map((template) => `"${template}"`).join(', ')}`;

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
        commands: {
          function: {
            usage: 'Create a function into the service',
            lifecycleEvents: [
              'create',
            ],
            options: {
              function: {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              handler: {
                usage: 'Handler for the function (e.g. --handler my-function/index.handler)',
                required: true,
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'create:create': () => BbPromise.bind(this)
        .then(this.create),
      'create:function:create': () => BbPromise.bind(this)
        .then(this.createFunction),
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
    this.serverless.utils.copyDirContentsSync(path.join(this.serverless.config.serverlessPath,
      'plugins', 'create', 'templates', this.options.template), process.cwd());

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

  createAWSNodeJSFuncFile(handlerPath) {
    const handlerInfo = path.parse(handlerPath);
    const handlerDir = path.join(this.serverless.config.servicePath, handlerInfo.dir);
    const handlerFile = `${handlerInfo.name}.js`;
    const handlerFunction = handlerInfo.ext.replace(/^\./, '');

    const templateFile = path.join(this.serverless.config.serverlessPath,
      'plugins', 'create', 'functionTemplates', 'aws-nodejs4.3', 'function.ejs');

    const templateText = fse.readFileSync(templateFile).toString();
    const jsFile = ejs.render(templateText, {
      handlerFunction,
    });

    const filePath = path.join(handlerDir, handlerFile);

    this.serverless.utils.writeFileDir(filePath);
    if (this.serverless.utils.fileExistsSync(filePath)) {
      const errorMessage = [
        `File "${filePath}" already exists. Cannot create function.`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    fse.writeFileSync(path.join(handlerDir, handlerFile), jsFile);

    this.serverless.cli.log(`Created function file "${path.join(handlerDir, handlerFile)}"`);
    return BbPromise.resolve();
  }

  createFunction() {
    this.serverless.cli.log('Generating function…');
    const functionName = this.options.function;
    const handler = this.options.handler;

    const serverlessYmlFilePath = path
        .join(this.serverless.config.servicePath, 'serverless.yml');

    const serverlessYmlFileContent = fse
      .readFileSync(serverlessYmlFilePath).toString();

    return this.serverless.yamlParser.parse(serverlessYmlFilePath)
    .then((config) => {
      const runtime = [config.provider.name, config.provider.runtime].join('-');

      if (validFunctionRuntimes.indexOf(runtime) < 0) {
        const errorMessage = [
          `Provider / Runtime "${runtime}" is not supported.`,
          ` Supported runtimes are: ${humanReadableFunctionRuntimes}.`,
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      const ymlEditor = yamlEdit(serverlessYmlFileContent);

      const funcDoc = {};
      funcDoc[functionName] = {
        handler,
      };

      if (ymlEditor.hasKey(`functions.${functionName}`)) {
        const errorMessage = [
          `Function "${functionName}" already exists. Cannot create function.`,
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      if (ymlEditor.insertChild('functions', funcDoc)) {
        const errorMessage = [
          `Could not find functions in ${serverlessYmlFilePath}`,
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      fse.writeFileSync(serverlessYmlFilePath, ymlEditor.dump());

      if (runtime === 'aws-nodejs4.3') {
        return this.createAWSNodeJSFuncFile(handler);
      }

      return BbPromise.resolve();
    });
  }
}

module.exports = Create;
