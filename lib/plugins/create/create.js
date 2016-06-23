'use strict';

const BbPromise = require('bluebird');
const fse = require('fs-extra');
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
          name: {
            usage: 'Name of the service',
            required: true,
          },
          provider: {
            usage: 'Provider of the service',
            required: true,
          },
        },
      },
    };

    this.hooks = {
      'create:create': () => BbPromise.bind(this)
        .then(this.prompt)
        .then(this.validate)
        .then(this.scaffold)
        .then(this.finish),
    };
  }

  validate() {
    this.serverless.cli.log('Creating new Serverless service...');

    // Validate Name - AWS only allows Alphanumeric and - in name
    const nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.options.name);
    if (!nameOk) {
      throw new this.serverless.classes.Error('Service names can only be alphanumeric and -');
    }

    if (['aws', 'azure', 'google', 'ibm'].indexOf(this.options.provider)) {
      throw new this.serverless.classes.Error('Please provide a valid provider.');
    }

    this.serverless.config
      .update({ servicePath: path.join(process.cwd(), this.options.name) });

    // parse yaml - returns a Promise
    return this.serverless.yamlParser.parse(path.join(this.serverless
      .config.serverlessPath, 'templates', 'serverless.yaml'));
  }

  scaffold(serverlessYamlParam) {
    const serverlessYaml = serverlessYamlParam;
    serverlessYaml.service = this.options.name;
    serverlessYaml.provider = this.options.provider;

    // write serverless.yaml
    this.serverless.utils.writeFileSync(path.join(this.serverless
      .config.servicePath, 'serverless.yaml'), serverlessYaml);

    // write serverless.env.yaml
    fse.copySync(path.join(this.serverless.config.serverlessPath,
      'templates', 'serverless.env.yaml'), path.join(this.serverless
      .config.servicePath, 'serverless.env.yaml'));

    // write handler.js
    fse.copySync(path.join(this.serverless.config.serverlessPath,
      'templates', 'nodejs', 'handler.js'), path.join(this.serverless
      .config.servicePath, 'handler.js'));

    return BbPromise.resolve();
  }

  finish() {
    this.serverless.cli.log(`Successfully created service "${this.options.name}"`);
    this.serverless.cli.log('  |- serverless.yaml');
    this.serverless.cli.log('  |- serverless.env.yaml');
    this.serverless.cli.log('  |- handler.js');
    return BbPromise.resolve();
  }
}

module.exports = Create;
