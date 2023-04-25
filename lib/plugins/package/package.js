'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const ServerlessError = require('../../serverless-error');
const cliCommandsSchema = require('../../cli/commands-schema');
const zipService = require('./lib/zip-service');
const packageService = require('./lib/package-service');

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
      'initialize': () => {
        const usesIncludeOrExclude = (packageConfig = {}) =>
          packageConfig.include || packageConfig.exclude;

        if (
          usesIncludeOrExclude(this.serverless.service.package || {}) ||
          Object.values(this.serverless.service.functions).some((func) =>
            usesIncludeOrExclude(func.package)
          ) ||
          Object.values(this.serverless.service.layers || {}).some((func) => {
            if (func != null) return usesIncludeOrExclude(func.package);
            return false;
          })
        ) {
          this.serverless._logDeprecation(
            'PACKAGE_PATTERNS',
            'Support for "package.include" and "package.exclude" will be removed in the next' +
              ' major release. Please use "package.patterns" instead'
          );
        }
      },
      'package:createDeploymentArtifacts': async () => this.packageService(),

      'package:function:package': async () => {
        if (this.options.function) {
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
