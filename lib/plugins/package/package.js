'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const cliCommandsSchema = require('../../cli/commands-schema');
const zipService = require('./lib/zipService');
const packageService = require('./lib/packageService');

class Package {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.servicePath = this.serverless.config.servicePath || '';
    this.packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath || '.', '.serverless');

    Object.assign(this, packageService, zipService);

    this.commands = {
      package: {
        ...cliCommandsSchema.get('package'),
        lifecycleEvents: [
          'cleanup',
          'initialize',
          'setupProviderConfiguration',
          'createDeploymentArtifacts',
          'compileLayers',
          'compileFunctions',
          'compileEvents',
          'finalize',
        ],
        commands: {
          function: {
            type: 'entrypoint',
            lifecycleEvents: ['package'],
          },
        },
      },
    };

    this.hooks = {
      'package:createDeploymentArtifacts': () => BbPromise.bind(this).then(this.packageService),

      'package:function:package': () => {
        if (this.options.function) {
          this.serverless.cli.log(`Packaging function: ${this.options.function}...`);
          return BbPromise.resolve(this.packageFunction(this.options.function));
        }
        return BbPromise.reject(new Error('Function name must be set'));
      },
    };
  }
}

module.exports = Package;
