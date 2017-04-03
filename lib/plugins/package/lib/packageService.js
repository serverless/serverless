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

  getServiceArtifactName() {
    return `${this.serverless.service.service}.zip`;
  },

  getFunctionArtifactName(functionObject) {
    return `${functionObject.name}.zip`;
  },

  packageService() {
    // check if the user has specified an own artifact
    if (this.serverless.service.package.artifact) {
      return BbPromise.resolve();
    }

    let shouldPackageService = false;

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
    const servicePath = this.serverless.config.servicePath;

    const exclude = this.getExcludes();
    const include = this.getIncludes();
    const zipFileName = this.getServiceArtifactName();

    return this.zipDirectory(servicePath, exclude, include, zipFileName).then(filePath => {
      this.serverless.service.package.artifact = filePath;
      return filePath;
    });
  },

  packageFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const funcPackageConfig = functionObject.package || {};

    functionObject.artifact = null; // reset the current artifact

    if (funcPackageConfig.artifact) {
      if (process.env.SLS_DEBUG) {
        this.serverless.cli.log('package.artifact is defined, skipping packaging');
      }

      functionObject.artifact = funcPackageConfig.artifact;
      return BbPromise.resolve(funcPackageConfig.artifact);
    }

    const servicePath = this.serverless.config.servicePath;

    const exclude = this.getExcludes(funcPackageConfig.exclude);
    const include = this.getIncludes(funcPackageConfig.include);
    const zipFileName = this.getFunctionArtifactName(functionObject);

    return this.zipDirectory(servicePath, exclude, include, zipFileName).then((artifactPath) => {
      functionObject.artifact = artifactPath;
      return artifactPath;
    });
  },
};
