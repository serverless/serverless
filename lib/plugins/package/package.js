'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const ServerlessError = require('../../serverless-error');
const cliCommandsSchema = require('../../cli/commands-schema');
const zipService = require('./lib/zipService');
const packageService = require('./lib/packageService');
const { legacy } = require('@serverless/utils/log');

class Package {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.servicePath = this.serverless.serviceDir || '';
    this.packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath || '.', '.serverless');

    Object.assign(this, packageService, zipService);

    this.commands = {
      package: {
        ...cliCommandsSchema.get('package'),
        commands: {
          function: {
            type: 'entrypoint',
            lifecycleEvents: ['package'],
          },
        },
      },
    };

    this.hooks = {
      'package:createDeploymentArtifacts': async () =>
        BbPromise.bind(this).then(this.packageService),

      'package:function:package': async () => {
        if (this.options.function) {
          legacy.log(`Packaging function: ${this.options.function}...`);
          return BbPromise.resolve(this.packageFunction(this.options.function));
        }
        return BbPromise.reject(
          new ServerlessError('Function name must be set', 'PACKAGE_MISSING_FUNCTION_OPTION')
        );
      },
    };
  }
}

module.exports = Package;
