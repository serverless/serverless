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
        },
      },
    };

    this.hooks = {
      'create:create': () => {
        return BbPromise.bind(this)
          .then(this.prompt)
          .then(this.validate)
          .then(this.parse)
          .spread(this.scaffold)
          .then(this.finish);
      },
    };
  }

  prompt() {
    if (this.serverless.config.interactive && !this.options.noGreeting) {
      this.serverless.cli.asciiGreeting();
    }

    this.serverless.cli.log('Creating new Serverless service...');

    return BbPromise.resolve();
  }

  validate() {
    // TODO remove once options validation in plugin manager works
    /*
    if (!this.options.name) {
      throw new this.serverless.classes.Error('Please provide a service name.');
    }

    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please provide a stage name.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please provide a region name.');
    }
    */

    // Validate Name - AWS only allows Alphanumeric and - in name
    const nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.options.name);
    if (!nameOk) {
      throw new this.serverless.classes.Error('Service names can only be alphanumeric and -');
    }

    this.serverless.config
      .update({ servicePath: path.join(process.cwd(), this.options.name) });
    return BbPromise.resolve();
  }

  parse() {
    const allPromises = [];
    allPromises.push(this.serverless.yamlParser.parse(path.join(this.serverless
      .config.serverlessPath, 'templates', 'serverless.yaml')));
    allPromises.push(this.serverless.utils.readFile(path.join(this.serverless
      .config.serverlessPath, 'templates', 'nodejs', 'package.json')));
    return BbPromise.all(allPromises);
  }

  scaffold(yaml, json) {
    const serverlessYaml = yaml;
    const packageJson = json;
    const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);
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

    serverlessEnvYaml.stages[this.options.stage].regions[convertedRegion] = {
      vars: {},
    };

    this.serverless.utils.writeFileSync(path.join(this.serverless
      .config.servicePath, 'serverless.yaml'), serverlessYaml);
    this.serverless.utils.writeFileSync(path.join(this.serverless
      .config.servicePath, 'package.json'), packageJson);
    this.serverless.utils.writeFileSync(path.join(this.serverless
      .config.servicePath, 'serverless.env.yaml'), serverlessEnvYaml);

    // copy handler.js
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
    this.serverless.cli.log('  |- package.json');
    return BbPromise.resolve();
  }
}

module.exports = Create;
