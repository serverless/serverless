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
    // check if the user has specified an own artifact
    if (this.serverless.service.package.artifact) {
      return BbPromise.resolve();
    }

    let shouldPackageService = false;

    this.serverless.cli.log('Packaging service...');

    if (this.serverless.service.package.individually) {
      const allFunctions = this.serverless.service.getAllFunctions();
      const packagePromises = _.map(allFunctions, functionName =>
        this.packageFunction(functionName));

    this.serverless.cli.log('Packaging service...');
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
    const zipFileName = this.provider.naming.getServiceArtifactName();

    return this.zipDirectory(exclude, include, zipFileName);
  },

  packageFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const funcPackageConfig = functionObject.package || {};

    const exclude = this.getExcludes(funcPackageConfig.exclude);
    const include = this.getIncludes(funcPackageConfig.include);
    const zipFileName = this.provider.naming.getFunctionArtifactName(functionName);

    return this.zipDirectory(exclude, include, zipFileName);
  },
};
