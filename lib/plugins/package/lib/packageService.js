'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const globby = require('globby');
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
    'serverless.js',
    '.serverless/**',
    '.serverless_plugins/**',
  ],

  getIncludes(include) {
    const packageIncludes = this.serverless.service.package.include || [];
    return _.union(packageIncludes, include);
  },

  getExcludes(exclude) {
    const packageExcludes = this.serverless.service.package.exclude || [];
    // add local service plugins Path
    const pluginsLocalPath = this.serverless.pluginManager
      .parsePluginsObject(this.serverless.service.plugins).localPath;

    const localPathExcludes = pluginsLocalPath ? [pluginsLocalPath] : [];
    // add defaults for exclude
    return _.union(this.defaultExcludes, localPathExcludes, packageExcludes, exclude);
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
    const zipFileName = `${this.serverless.service.service}.zip`;

    return this.resolveFilePathsAll().then(filePaths =>
      this.zipFiles(filePaths, zipFileName).then(filePath => {
        // only set the default artifact for backward-compatibility
        // when no explicit artifact is defined
        if (!this.serverless.service.package.artifact) {
          this.serverless.service.package.artifact = filePath;
          this.serverless.service.artifact = filePath;
        }
        return filePath;
      })
    );
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

    const zipFileName = `${functionName}.zip`;

    return this.resolveFilePathsFunction(functionName).then(filePaths =>
      this.zipFiles(filePaths, zipFileName).then(artifactPath => {
        functionObject.package = {
          artifact: artifactPath,
        };
        return artifactPath;
      })
    );
  },

  resolveFilePathsAll() {
    const params = { exclude: this.getExcludes(), include: this.getIncludes() };
    return this.excludeDevDependencies(params).then(() =>
      this.resolveFilePathsFromPatterns(params));
  },

  resolveFilePathsFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const funcPackageConfig = functionObject.package || {};

    const params = {
      exclude: this.getExcludes(funcPackageConfig.exclude),
      include: this.getIncludes(funcPackageConfig.include),
    };
    return this.excludeDevDependencies(params).then(() =>
      this.resolveFilePathsFromPatterns(params));
  },

  resolveFilePathsFromPatterns(params) {
    const patterns = ['**'];

    params.exclude.forEach((pattern) => {
      if (pattern.charAt(0) !== '!') {
        patterns.push(`!${pattern}`);
      } else {
        patterns.push(pattern.substring(1));
      }
    });

    // push the include globs to the end of the array
    // (files and folders will be re-added again even if they were excluded beforehand)
    params.include.forEach((pattern) => {
      patterns.push(pattern);
    });

    return globby(patterns, {
      cwd: this.serverless.config.servicePath,
      dot: true,
      silent: true,
      follow: true,
      nodir: true,
    }).then(filePaths => {
      if (filePaths.length !== 0) return filePaths;
      throw new this.serverless.classes.Error('No file matches include / exclude patterns');
    });
  },
};
