'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

function getTimeString() {
  return (new Date()).getTime().toString();
}

module.exports = {
  defaultExcludes: [
    '.git',
    '.gitignore',
    '.DS_Store',
    'npm-debug.log',
    'serverless.yaml',
    'serverless.yml',
    'serverless.env.yaml',
    'serverless.env.yml',
    '.serverless',
  ],

  getExcludedPaths(exclude) {
    const packageExcludes = this.serverless.service.package.exclude || [];

    // add defaults for exclude
    return _.union(exclude, packageExcludes, this.defaultExcludes);
  },

  getIncludedPaths(include) {
    const packageIncludes = this.serverless.service.package.include || [];
    return _.union(include, packageIncludes);
  },

  getServiceArtifactName() {
    const currentTime = getTimeString();
    return `${this.serverless.service.service}-${currentTime}.zip`;
  },

  getFunctionArtifactName(functionObject) {
    const currentTime = getTimeString();
    return `${this.serverless.service.service}-${functionObject.name}-${currentTime}.zip`;
  },

  packageService() {
    // check if the user has specified an own artifact
    if (this.serverless.service.package.artifact) {
      return BbPromise.resolve();
    }

    this.serverless.cli.log('Packaging service...');

    if (this.serverless.service.package.individually) {
      const allFunctions = this.serverless.service.getAllFunctions();
      const packagePromises = _.map(allFunctions, functionName => {
        const functionObject = this.serverless.service.getFunction(functionName);
        return this.packageFunction(functionObject);
      });

      return BbPromise.all(packagePromises);
    }

    return this.packageAll();
  },

  packageAll() {
    const servicePath = this.serverless.config.servicePath;

    const exclude = this.getExcludedPaths();
    const include = this.getIncludedPaths();
    const zipFileName = this.getServiceArtifactName();

    return this.zipDirectory(servicePath, exclude, include, zipFileName).then(filePath => {
      this.serverless.service.package.artifact = filePath;
      return filePath;
    });
  },

  packageFunction(functionObject) {
    const funcPackageConfig = functionObject.package || {};

    const servicePath = this.serverless.config.servicePath;

    const exclude = this.getExcludedPaths(funcPackageConfig.exclude);
    const include = this.getIncludedPaths(funcPackageConfig.include);
    const zipFileName = this.getFunctionArtifactName(functionObject);

    return this.zipDirectory(servicePath, exclude, include, zipFileName).then((artifactPath) => {
      functionObject.artifact = artifactPath; // eslint-disable-line no-param-reassign
      return artifactPath;
    });
  },
};
