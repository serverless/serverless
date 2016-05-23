'use strict';

const BbPromise = require('bluebird');
const fse = require('fs-extra');
const path = require('path');

class Create {
  constructor(serverless) {
    this.serverless = serverless;
    this.commands = {
      create: {
        usage: 'create new Serverless Service.',
        lifeCycleEvents: [
          'create',
        ],
      },
    };


    this.hooks = {
      'create:create': () => BbPromise.bind(this)
          .then(this.prompt)
          .then(this.validate)
          .then(this.parse)
          .spread(this.scaffold)
          .then(this.finish),
    };
  }

  // mocking prompt for now till we finish cli
  prompt() {
    this.options = {
      noGreeting: false,
      name: 'new-service',
      stage: 'dev',
      region: 'aws_useast1',
    };

    if (this.serverless.instances.config.interactive && !this.options.noGreeting) {
      this.serverless.instances.cli.asciiGreeting();
    }

    console.log('');
    this.serverless.instances.cli.log('Creating new Serverless service...');

    this.serverless.instances.config
      .update({ servicePath: path.join(process.cwd(), this.options.name) });

    return BbPromise.resolve();
  }

  validate() {
    // Validate Name - AWS only allows Alphanumeric and - in name
    const nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.options.name);
    if (!nameOk) {
      return BbPromise.reject(new this.serverless.classes
        .SError('Service names can only be alphanumeric and -'));
    }
    return BbPromise.resolve();
  }

  parse() {
    const allPromises = [];
    allPromises.push(this.serverless.instances.yamlParser.parse(path.join(this.serverless
      .instances.config.serverlessPath, 'templates', 'serverless.yaml')));
    allPromises.push(this.serverless.instances.utils.readFile(path.join(this.serverless
      .instances.config.serverlessPath, 'templates', 'nodejs', 'package.json')));
    return BbPromise.all(allPromises);
  }

  scaffold(yaml, json) {
    const serverlessYaml = yaml;
    const packageJson = json;
    serverlessYaml.service = this.options.name;
    packageJson.name = this.options.name;

    const serverlessEnvYaml = {
      vars: {},
      stages: {},
    };

    serverlessEnvYaml.stages[this.options.stage] = {
      vars: {},
      regions: {},
    };

    serverlessEnvYaml.stages[this.options.stage].regions[this.options.region] = {
      vars: {},
    };

    this.serverless.instances.utils.writeFileSync(path.join(this.serverless
      .instances.config.servicePath, 'serverless.yaml'), serverlessYaml);
    this.serverless.instances.utils.writeFileSync(path.join(this.serverless
      .instances.config.servicePath, 'package.json'), packageJson);
    this.serverless.instances.utils.writeFileSync(path.join(this.serverless
      .instances.config.servicePath, 'serverless.env.yaml'), serverlessEnvYaml);

    // copy handler.js
    fse.copySync(path.join(this.serverless.instances.config.serverlessPath,
      'templates', 'nodejs', 'handler.js'), path.join(this.serverless
      .instances.config.servicePath, 'users.js'));

    return BbPromise.resolve();
  }

  finish() {
    this.serverless.instances.cli.log(`Successfully created service "${this.options.name}"`);
    this.serverless.instances.cli.log('  |- serverless.yaml');
    this.serverless.instances.cli.log('  |- serverless.env.yaml');
    this.serverless.instances.cli.log('  |- handler.js');
    this.serverless.instances.cli.log('  |- package.json');
    return BbPromise.resolve();
  }
}

module.exports = Create;
