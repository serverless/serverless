'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const globby = require('globby');
const _ = require('lodash');
const nanomatch = require('nanomatch');
const serverlessConfigFileUtils = require('../../../../lib/utils/getServerlessConfigFile');

module.exports = {
  defaultExcludes: [
    '.git/**',
    '.gitignore',
    '.DS_Store',
    'npm-debug.log',
    'yarn-*.log',
    '.serverless/**',
    '.serverless_plugins/**',
  ],

  getIncludes(include) {
    const packageIncludes = this.serverless.service.package.include || [];
    return _.union(packageIncludes, include);
  },

  getExcludes(exclude, excludeLayers) {
    return serverlessConfigFileUtils
      .getServerlessConfigFilePath(this.serverless)
      .then(configFilePath => {
        const packageExcludes = this.serverless.service.package.exclude || [];
        // add local service plugins Path
        const pluginsLocalPath = this.serverless.pluginManager.parsePluginsObject(
          this.serverless.service.plugins
        ).localPath;
        const localPathExcludes = pluginsLocalPath ? [pluginsLocalPath] : [];
        // add layer paths
        const layerExcludes = excludeLayers
          ? this.serverless.service
              .getAllLayers()
              .map(layer => `${this.serverless.service.getLayer(layer).path}/**`)
          : [];
        // add defaults for exclude

        const serverlessConfigFileExclude = configFilePath ? [path.basename(configFilePath)] : [];

        return _.union(
          this.defaultExcludes,
          serverlessConfigFileExclude,
          localPathExcludes,
          packageExcludes,
          layerExcludes,
          exclude
        );
      });
  },

  packageService() {
    this.serverless.cli.log('Packaging service...');
    let shouldPackageService = false;
    const allFunctions = this.serverless.service.getAllFunctions();
    let packagePromises = _.map(allFunctions, functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);
      functionObject.package = functionObject.package || {};
      if (functionObject.package.disable) {
        this.serverless.cli.log(`Packaging disabled for function: "${functionName}"`);
        return BbPromise.resolve();
      }
      if (functionObject.package.artifact) {
        return BbPromise.resolve();
      }
      if (functionObject.package.individually || this.serverless.service.package.individually) {
        return this.packageFunction(functionName);
      }
      shouldPackageService = true;
      return BbPromise.resolve();
    });
    const allLayers = this.serverless.service.getAllLayers();
    packagePromises = packagePromises.concat(
      _.map(allLayers, layerName => {
        const layerObject = this.serverless.service.getLayer(layerName);
        layerObject.package = layerObject.package || {};
        if (layerObject.package.artifact) {
          return BbPromise.resolve();
        }
        return this.packageLayer(layerName);
      })
    );

    return BbPromise.all(packagePromises).then(() => {
      if (shouldPackageService && !this.serverless.service.package.artifact) {
        return this.packageAll();
      }
      return BbPromise.resolve();
    });
  },

  packageAll() {
    const zipFileName = `${this.serverless.service.service}.zip`;
    /*
     * crosscompiled GoLang binaries on windows don't have their execute bit set correctly.
     * This is nearly impossible to actually set on a windows machine, so find all the Go handler
     * files and pass them into zipFiles as files to add with the execute bit in the zip file
     */
    const filesToChmodPlusX =
      process.platform !== 'win32'
        ? []
        : Object.values(this.serverless.service.functions)
            .map(f =>
              Object.assign(
                {
                  runtime: this.serverless.service.provider.runtime || 'node8.10',
                },
                f
              )
            )
            .filter(f => f.runtime && f.runtime.startsWith('go'))
            .map(f => path.normalize(f.handler));

    return this.resolveFilePathsAll().then(filePaths =>
      this.zipFiles(filePaths, zipFileName, undefined, filesToChmodPlusX).then(filePath => {
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
    // and if the function is not set to be packaged individually
    if (this.serverless.service.package.artifact && !funcPackageConfig.individually) {
      const filePath = path.join(
        this.serverless.config.servicePath,
        this.serverless.service.package.artifact
      );
      funcPackageConfig.artifact = filePath;
      return BbPromise.resolve(filePath);
    }

    const zipFileName = `${functionName}.zip`;
    const filesToChmodPlusX = [];
    if (process.platform === 'win32') {
      const runtime =
        functionName.runtime || this.serverless.service.provider.runtime || 'node8.10';
      if (runtime.startsWith('go')) {
        filesToChmodPlusX.push(functionObject.handler);
      }
    }

    return this.resolveFilePathsFunction(functionName).then(filePaths =>
      this.zipFiles(filePaths, zipFileName, undefined, filesToChmodPlusX).then(artifactPath => {
        funcPackageConfig.artifact = artifactPath;
        return artifactPath;
      })
    );
  },

  packageLayer(layerName) {
    const layerObject = this.serverless.service.getLayer(layerName);

    const zipFileName = `${layerName}.zip`;

    return this.resolveFilePathsLayer(layerName)
      .then(filePaths => filePaths.map(f => path.resolve(path.join(layerObject.path, f))))
      .then(filePaths =>
        this.zipFiles(filePaths, zipFileName, path.resolve(layerObject.path)).then(artifactPath => {
          layerObject.package = {
            artifact: artifactPath,
          };
          return artifactPath;
        })
      );
  },

  resolveFilePathsAll() {
    return this.getExcludes([], true)
      .then(exclude => {
        const params = { exclude, include: this.getIncludes() };
        return params;
      })
      .then(params => this.excludeDevDependencies(params))
      .then(params => this.resolveFilePathsFromPatterns(params));
  },

  resolveFilePathsFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const funcPackageConfig = functionObject.package || {};

    return this.getExcludes(funcPackageConfig.exclude, true)
      .then(exclude => {
        const params = { exclude, include: this.getIncludes(funcPackageConfig.include) };
        return params;
      })
      .then(params => this.excludeDevDependencies(params))
      .then(params => this.resolveFilePathsFromPatterns(params));
  },

  resolveFilePathsLayer(layerName) {
    const layerObject = this.serverless.service.getLayer(layerName);
    const layerPackageConfig = layerObject.package || {};

    return this.getExcludes(layerPackageConfig.exclude, true)
      .then(exclude => {
        const params = { exclude, include: this.getIncludes(layerPackageConfig.include) };
        return params;
      })
      .then(params => this.excludeDevDependencies(params))
      .then(params => this.resolveFilePathsFromPatterns(params, layerObject.path));
  },

  resolveFilePathsFromPatterns(params, prefix) {
    const patterns = [];

    params.exclude.forEach(pattern => {
      if (pattern.charAt(0) !== '!') {
        patterns.push(`!${pattern}`);
      } else {
        patterns.push(pattern.substring(1));
      }
    });

    // push the include globs to the end of the array
    // (files and folders will be re-added again even if they were excluded beforehand)
    params.include.forEach(pattern => {
      patterns.push(pattern);
    });

    // NOTE: please keep this order of concatenating the include params
    // rather than doing it the other way round!
    // see https://github.com/serverless/serverless/pull/5825 for more information
    return globby(['**'].concat(params.include), {
      cwd: path.join(this.serverless.config.servicePath, prefix || ''),
      dot: true,
      silent: true,
      follow: true,
      nodir: true,
    }).then(allFilePaths => {
      const filePathStates = allFilePaths.reduce((p, c) => Object.assign(p, { [c]: true }), {});
      patterns
        // nanomatch only does / style path delimiters, so convert them if on windows
        .map(p => {
          return process.platform === 'win32' ? p.replace(/\\/g, '/') : p;
        })
        .forEach(p => {
          const exclude = p.startsWith('!');
          const pattern = exclude ? p.slice(1) : p;
          nanomatch(allFilePaths, [pattern], { dot: true }).forEach(key => {
            filePathStates[key] = !exclude;
          });
        });
      const filePaths = _.toPairs(filePathStates)
        .filter(r => r[1] === true)
        .map(r => r[0]);
      if (filePaths.length !== 0) return filePaths;
      throw new this.serverless.classes.Error('No file matches include / exclude patterns');
    });
  },
};
