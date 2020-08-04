'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const path = require('path');
const globby = require('globby');
const _ = require('lodash');
const nanomatch = require('nanomatch');
const serverlessConfigFileUtils = require('../../../../lib/utils/getServerlessConfigFile');
const program = require('child_process');

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

  getRuntime(runtime) {
    const defaultRuntime = 'nodejs12.x';
    return runtime || this.serverless.service.provider.runtime || defaultRuntime;
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
    this.serverless.cli.debugLog('Packaging service...');
    let shouldPackageService = false;
    const allFunctions = this.serverless.service.getAllFunctions();
    let packagePromises = allFunctions.map(functionName => {
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
        return this.buildFunction(functionName)
        .then(() => this.packageFunction(functionName));
      }
      shouldPackageService = true;
      return BbPromise.resolve();
    });
    const allLayers = this.serverless.service.getAllLayers();
    packagePromises = packagePromises.concat(
      allLayers.map(layerName => {
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
                  runtime: this.getRuntime(),
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
    this.serverless.cli.debugLog(`Packaging function ${functionName}`);
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
      const runtime = this.getRuntime(functionObject.runtime);
      if (runtime.startsWith('go')) {
        filesToChmodPlusX.push(functionObject.handler);
      }
    }

    const prefix = this.filePrefixForFunction(functionName);

    return this.resolveFilePathsFunction(functionName, prefix).then(filePaths =>
      this.zipFiles(filePaths, zipFileName, prefix, filesToChmodPlusX).then(artifactPath => {
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

  resolveFilePathsFunction(functionName, prefix) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const funcPackageConfig = functionObject.package || {};

    return this.getExcludes(funcPackageConfig.exclude, true)
      .then(exclude => {
        const params = { exclude, include: this.getIncludes(funcPackageConfig.include) };
        return params;
      })
      .then(params => this.excludeDevDependencies(params, prefix))
      .then(params => this.resolveFilePathsFromPatterns(params, prefix));
  },

  buildFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const runtime = this.getRuntime(functionObject.runtime);
    this.serverless.cli.debugLog(`Ready function ${functionName} for ${runtime}`);
    if (runtime.startsWith('dotnet')) {
      return this.buildDotNetFunction(functionObject);
    }
    return BbPromise.resolve()
  },

  buildDotNetFunction(functionObject) {
    // compile all .csproj files in the includes glob
    if (!functionObject.package || !functionObject.package.include) {
      throw `You must specify the .Net project file (e.g. .csproj) in the function|package|include section of serverless.yml for function ${functionObject.name}`;
    }
    const includes = this.getIncludes(functionObject.package.include);
    const functionName = functionObject.name;
    const self = this;
    return includes.reduce( (previousPromise, srcPath) => {
      return previousPromise.then(() => {
        if (srcPath.endsWith('.csproj')) {
          return new BbPromise(function (resolve, reject) {
            try {
              self.serverless.cli.debugLog(`building ${srcPath}`);
              const outputPath = path.join(self.serverless.config.servicePath, '.bin', functionName);
              self.mkDirByPathSync(outputPath);
              const configuration = 'Release';
              program.exec(`dotnet publish ${srcPath} -c ${configuration} -o ${outputPath} --nologo /p:GenerateRuntimeConfigurationFiles=true`,
                function(error, stdout, stderr){
                  console.log(stdout);
      
                  if (error) {
                    console.log('An error occured while restoring packages');
                    console.log(stderr);
                    return reject(error);
                  }
                  return resolve();
                }
              );
            } catch (err) {
              return reject(err);
            }
          });
        } else {
          return BbPromise.resolve();
        }
      });
    }, Promise.resolve());
  },

  mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';
  
    return targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(baseDir, parentDir, childDir);
      try {
        fs.mkdirSync(curDir);
      } catch (err) {
        if (err.code === 'EEXIST') { // curDir already exists!
          return curDir;
        }
  
        // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
        if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
          throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
        }
  
        const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
        if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
          throw err; // Throw if it's just the last created dir.
        }
      }
  
      return curDir;
    }, initDir);
  },

  filePrefixForFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const runtime = this.getRuntime(functionObject.runtime);
    if (runtime.startsWith('dotnet')) {
      return `.bin/${functionObject.name}`;
    }
    // fallback for all other languages, package from root folder
    return undefined;
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
      expandDirectories: false,
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
        .map(r => path.join(prefix, r[0]));
      if (filePaths.length !== 0) return filePaths;
      throw new this.serverless.classes.Error('No file matches include / exclude patterns');
    });
  },
};
