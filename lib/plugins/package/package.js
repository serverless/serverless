'use strict';

const path = require('path');
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
        usage: 'Packages a Serverless service',
        configDependent: true,
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
        options: {
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          package: {
            usage: 'Output path for the package',
            shortcut: 'p',
          },
        },
        commands: {
          function: {
            type: 'entrypoint',
            lifecycleEvents: ['package'],
          },
        },
      },
    };

    this.hooks = {
      'package:createDeploymentArtifacts': async () => this.packageService(),

      'package:function:package': async () => {
        if (this.options.function) {
          this.serverless.cli.log(`Packaging function: ${this.options.function}...`);
          return this.packageFunction(this.options.function);
        }
        throw new Error('Function name must be set');
      },
    };
  }
}

module.exports = Package;
