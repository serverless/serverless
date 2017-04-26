'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  defaultExcludes: [
    '.git/**',
    '.gitignore',
    '.DS_Store',
    'npm-debug.log',
    'serverless.yaml',
    'serverless.yml',
    '.serverless/**',
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
      if (functionObject.package.individually || this.serverless.service
          .package.individually) {
        return this.packageFunction(functionName);
      }
      shouldPackageService = true;
      return BbPromise.resolve();
    });

    return BbPromise.all(packagePromises).then(() => {
      if (shouldPackageService) {
        return this.packageAll();
      }
      return BbPromise.resolve();
    });
  },

  packageAll() {
    const exclude = this.getExcludes();
    const include = this.getIncludes();
    const zipFileName = `${this.serverless.service.service}.zip`;

    return this.zipDirectory(exclude, include, zipFileName).then(filePath => {
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

    const exclude = this.getExcludes(funcPackageConfig.exclude);
    const include = this.getIncludes(funcPackageConfig.include);
    const zipFileName = `${functionName}.zip`;

    return this.zipDirectory(exclude, include, zipFileName).then(artifactPath => {
      functionObject.artifact = artifactPath;
      return artifactPath;
    });
  },
};
