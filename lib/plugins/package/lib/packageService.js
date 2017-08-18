'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');

module.exports = {
  defaultExcludes: [
    '.git/**',
    '.gitignore',
    '.DS_Store',
    'npm-debug.log',
    'serverless.yml',
    'serverless.yaml',
    'serverless.json',
    '.serverless/**',
    '.serverless_plugins/**',
  ],

  getIncludes(include) {
    const packageIncludes = this.serverless.service.package.include || [];
    return _.union(packageIncludes, include);
  },

  getExcludes(exclude) {
    const packageExcludes = this.serverless.service.package.exclude || [];

    // add defaults for exclude
    return _.union(this.defaultExcludes, packageExcludes, exclude);
  },

  packageService() {
    this.serverless.cli.log('Packaging service...');
    let shouldPackageService = false;
    const allFunctions = this.serverless.service.getAllFunctions();
    const packagePromises = _.map(allFunctions, functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);
      functionObject.package = functionObject.package || {};
      if (functionObject.package.disable) {
        this.serverless.cli.log(`Packaging disabled for function: "${functionName}"`);
        return BbPromise.resolve();
      }
      if (functionObject.package.artifact) {
        return BbPromise.resolve();
      }
      if (functionObject.package.individually || this.serverless.service
          .package.individually) {
        return this.packageFunction(functionName);
      }
      shouldPackageService = true;
      return BbPromise.resolve();
    });

    return BbPromise.all(packagePromises).then(() => {
      if (shouldPackageService && !this.serverless.service.package.artifact) {
        return this.packageAll();
      }
      return BbPromise.resolve();
    });
  },

  packageAll() {
    const exclude = this.getExcludes();
    const include = this.getIncludes();
    const zipFileName = `${this.serverless.service.service}.zip`;

    return this.zipService(exclude, include, zipFileName).then(filePath => {
      // only set the default artifact for backward-compatibility
      // when no explicit artifact is defined
      if (!this.serverless.service.package.artifact) {
        this.serverless.service.package.artifact = filePath;
        this.serverless.service.artifact = filePath;
      }
      return filePath;
    });
  },

  packageFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const funcPackageConfig = functionObject.package || {};

    // use the artifact in function config if provided
    if (funcPackageConfig.artifact) {
      const filePath = path.join(this.serverless.config.servicePath, funcPackageConfig.artifact);
      functionObject.package.artifact = filePath;
      return BbPromise.resolve(filePath);
    }

    // use the artifact in service config if provided
    if (this.serverless.service.package.artifact) {
      const filePath = path.join(this.serverless.config.servicePath,
        this.serverless.service.package.artifact);
      funcPackageConfig.artifact = filePath;
      return BbPromise.resolve(filePath);
    }

    const exclude = this.getExcludes(funcPackageConfig.exclude);
    const include = this.getIncludes(funcPackageConfig.include);
    const zipFileName = `${functionName}.zip`;

    return this.zipService(exclude, include, zipFileName).then(artifactPath => {
      functionObject.package = {
        artifact: artifactPath,
      };
      return artifactPath;
    });
  },
};
