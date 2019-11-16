'use strict';

const BbPromise = require('bluebird');
const archiver = require('archiver');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = BbPromise.promisifyAll(require('fs'));
const childProcess = BbPromise.promisifyAll(require('child_process'));
const globby = require('globby');
const _ = require('lodash');

module.exports = {
  zipService(exclude, include, zipFileName) {
    const params = {
      exclude,
      include,
      zipFileName,
    };

    return BbPromise.bind(this)
      .then(() => BbPromise.resolve(params))
      .then(this.excludeDevDependencies)
      .then(this.zip);
  },

  excludeDevDependencies(params) {
    const servicePath = this.serverless.config.servicePath;

    let excludeDevDependencies = this.serverless.service.package.excludeDevDependencies;
    if (excludeDevDependencies === undefined || excludeDevDependencies === null) {
      excludeDevDependencies = true;
    }

    if (excludeDevDependencies) {
      this.serverless.cli.log('Excluding development dependencies...');

      return BbPromise.bind(this)
        .then(() => excludeNodeDevDependencies(servicePath))
        .then(exAndInNode => {
          params.exclude = _.union(params.exclude, exAndInNode.exclude); //eslint-disable-line
          params.include = _.union(params.include, exAndInNode.include); //eslint-disable-line
          return params;
        })
        .catch(() => params);
    }

    return BbPromise.resolve(params);
  },

  zip(params) {
    return this.resolveFilePathsFromPatterns(params).then(filePaths =>
      this.zipFiles(filePaths, params.zipFileName)
    );
  },

  /**
   * Create a zip file on disk from an array of filenames of files on disk
   * @param files - an Array of filenames
   * @param zipFiles - the filename to save the zip at
   * @param prefix - a prefix to strip from the file names. use for layers support
   * @param filesToChmodPlusX - an array of files to add the execute bit to.
   *                            used for golang support on windows.
   */
  zipFiles(files, zipFileName, prefix, filesToChmodPlusX) {
    if (files.length === 0) {
      const error = new this.serverless.classes.Error('No files to package');
      return BbPromise.reject(error);
    }

    const zip = archiver.create('zip');
    // Create artifact in temp path and move it to the package path (if any) later
    const artifactFilePath = path.join(
      this.serverless.config.servicePath,
      '.serverless',
      zipFileName
    );
    this.serverless.utils.writeFileDir(artifactFilePath);

    const output = fs.createWriteStream(artifactFilePath);

    return new BbPromise((resolve, reject) => {
      output.on('close', () => resolve(artifactFilePath));
      output.on('error', err => reject(err));
      zip.on('error', err => reject(err));

      output.on('open', () => {
        zip.pipe(output);

        // normalize both maps to avoid problems with e.g. Path Separators in different shells
        const normalizedFiles = _.uniq(files.map(file => path.normalize(file)));
        const normalizedFilesToChmodPlusX =
          filesToChmodPlusX && _.uniq(filesToChmodPlusX.map(file => path.normalize(file)));

        return BbPromise.all(normalizedFiles.map(this.getFileContentAndStat.bind(this)))
          .then(contents => {
            _.forEach(_.sortBy(contents, ['filePath']), file => {
              const name = file.filePath.slice(prefix ? `${prefix}${path.sep}`.length : 0);
              let mode = file.stat.mode;
              if (
                normalizedFilesToChmodPlusX &&
                _.includes(normalizedFilesToChmodPlusX, name) &&
                file.stat.mode % 2 === 0
              ) {
                mode += 1;
              }
              zip.append(file.data, {
                name,
                mode,
                date: new Date(0), // necessary to get the same hash when zipping the same content
              });
            });

            zip.finalize();
          })
          .catch(reject);
      });
    });
  },

  getFileContentAndStat(filePath) {
    const fullPath = path.resolve(this.serverless.config.servicePath, filePath);

    return BbPromise.all([
      // Get file contents and stat in parallel
      this.getFileContent(fullPath),
      fs.statAsync(fullPath),
    ]).then(result => ({
      data: result[0],
      stat: result[1],
      filePath,
    }));
  },

  // Useful point of entry for e.g. transpilation plugins
  getFileContent(fullPath) {
    return fs.readFileAsync(fullPath);
  },
};

// eslint-disable-next-line
function excludeNodeDevDependencies(servicePath) {
  const exAndIn = {
    include: [],
    exclude: [],
  };

  // the files where we'll write the dependencies into
  const tmpDir = os.tmpdir();
  const randHash = crypto.randomBytes(8).toString('hex');
  const nodeDevDepFile = path.join(tmpDir, `node-dependencies-${randHash}-dev`);
  const nodeProdDepFile = path.join(tmpDir, `node-dependencies-${randHash}-prod`);

  try {
    const packageJsonFilePaths = globby.sync(
      [
        '**/package.json',
        // TODO add glob for node_modules filtering
      ],
      {
        cwd: servicePath,
        dot: true,
        silent: true,
        follow: true,
        nosort: true,
      }
    );

    // filter out non node_modules file paths
    const packageJsonPaths = _.filter(packageJsonFilePaths, filePath => {
      const isNodeModulesDir = !!filePath.match(/node_modules/);
      return !isNodeModulesDir;
    });

    if (_.isEmpty(packageJsonPaths)) {
      return BbPromise.resolve(exAndIn);
    }

    // NOTE: using mapSeries here for a sequential computation (w/o race conditions)
    return (
      BbPromise.mapSeries(packageJsonPaths, packageJsonPath => {
        // the path where the package.json file lives
        const fullPath = path.join(servicePath, packageJsonPath);
        const dirWithPackageJson = fullPath.replace(path.join(path.sep, 'package.json'), '');

        // we added a catch which resolves so that npm commands with an exit code of 1
        // (e.g. if the package.json is invalid) won't crash the dev dependency exclusion process
        return BbPromise.map(['dev', 'prod'], env => {
          const depFile = env === 'dev' ? nodeDevDepFile : nodeProdDepFile;
          return childProcess
            .execAsync(
              `npm ls --${env}=true --parseable=true --long=false --silent >> ${depFile}`,
              { cwd: dirWithPackageJson }
            )
            .catch(() => BbPromise.resolve());
        });
      })
        // NOTE: using mapSeries here for a sequential computation (w/o race conditions)
        .then(() =>
          BbPromise.mapSeries(['dev', 'prod'], env => {
            const depFile = env === 'dev' ? nodeDevDepFile : nodeProdDepFile;
            return fs
              .readFileAsync(depFile)
              .then(fileContent =>
                _.compact(
                  _.uniq(_.split(fileContent.toString('utf8'), '\n')),
                  elem => elem.length > 0
                )
              )
              .catch(() => BbPromise.resolve());
          })
        )
        .then(devAndProDependencies => {
          const devDependencies = devAndProDependencies[0];
          const prodDependencies = devAndProDependencies[1];

          // NOTE: the order for _.difference is important
          const dependencies = _.difference(devDependencies, prodDependencies);
          const nodeModulesRegex = new RegExp(`${path.join('node_modules', path.sep)}.*`, 'g');

          if (!_.isEmpty(dependencies)) {
            return BbPromise.map(dependencies, item =>
              item.replace(path.join(servicePath, path.sep), '')
            )
              .filter(item => item.length > 0 && item.match(nodeModulesRegex))
              .reduce((globs, item) => {
                const packagePath = path.join(servicePath, item, 'package.json');
                return fs.readFileAsync(packagePath, 'utf-8').then(packageJsonFile => {
                  const lastIndex = item.lastIndexOf(path.sep) + 1;
                  const moduleName = item.substr(lastIndex);
                  const modulePath = item.substr(0, lastIndex);

                  const packageJson = JSON.parse(packageJsonFile);
                  const bin = packageJson.bin;

                  const baseGlobs = [path.join(item, '**')];

                  // NOTE: pkg.bin can be object, string, or undefined
                  if (typeof bin === 'object') {
                    _.each(_.keys(bin), executable => {
                      baseGlobs.push(path.join(modulePath, '.bin', executable));
                    });
                    // only 1 executable with same name as lib
                  } else if (typeof bin === 'string') {
                    baseGlobs.push(path.join(modulePath, '.bin', moduleName));
                  }

                  return globs.concat(baseGlobs);
                });
              }, [])
              .then(globs => {
                exAndIn.exclude = exAndIn.exclude.concat(globs);
                return exAndIn;
              });
          }

          return exAndIn;
        })
        .then(() => {
          // cleanup
          fs.unlinkSync(nodeDevDepFile);
          fs.unlinkSync(nodeProdDepFile);
          return exAndIn;
        })
        .catch(() => exAndIn)
    );
  } catch (e) {
    // fail silently
  }
}
