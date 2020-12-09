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
        const useIncludeExclude = (packageConfig = {}) => {
          if (packageConfig.include || packageConfig.exclude) {
            if (
              packageConfig.functions &&
              (packageConfig.patterns ||
                Object.values(packageConfig.functions).some(func => func.package.patterns))
            ) {
              throw new this.serverless.classes.Error(
                'Package settings "patterns" and "include/exclude" can\'t be used in the same service. Use only "patterns"'
              );
            }
            return true;
          }
          return false;
        };
        const servicePackage = this.serverless.service.package || {};
        if (
          useIncludeExclude(servicePackage) ||
          Object.values(this.serverless.service.functions).some(func =>
            useIncludeExclude(func.package)
          )
        ) {
          this.serverless._logDeprecation(
            'NEW_PACKAGE_PATTERNS',
            'Starting with next major version, the "include" and "exclude" options will be removed.'
          );
        }
      },
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
