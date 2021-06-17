'use strict';

const archiver = require('archiver');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const fs = require('fs');
const childProcess = require('child_process');
const globby = require('globby');
const _ = require('lodash');

const mapPromiseSeries = require('../../../utils/promise/mapPromiseSeries');

const excludeNodeDevDependenciesMemoized = _.memoize(excludeNodeDevDependencies);

module.exports = {
  async zipService(exclude, include, zipFileName) {
    const params = {
      exclude,
      include,
      zipFileName,
    };

    return await this.excludeDevDependencies(params).then(this.zip);
  },

  async excludeDevDependencies(params) {
    const servicePath = this.serverless.config.servicePath;

    mapPromiseSeries(['test'], item => {
      return Promise.resolve();
    });

    let excludeDevDependencies = this.serverless.service.package.excludeDevDependencies;
    if (excludeDevDependencies === undefined || excludeDevDependencies === null) {
      excludeDevDependencies = true;
    }

    if (excludeDevDependencies) {
      this.serverless.cli.log('Excluding development dependencies...');

      return excludeNodeDevDependenciesMemoized(servicePath)
        .then(exAndInNode => {
          params.exclude = _.union(params.exclude, exAndInNode.exclude); //eslint-disable-line
          params.include = _.union(params.include, exAndInNode.include); //eslint-disable-line
          return params;
        })
        .catch(() => params);
    }

    return Promise.resolve(params);
  },

  async zip(params) {
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
  async zipFiles(files, zipFileName, prefix, filesToChmodPlusX) {
    if (files.length === 0) {
      const error = new this.serverless.classes.Error('No files to package');
      return Promise.reject(error);
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

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve(artifactFilePath));
      output.on('error', err => reject(err));
      zip.on('error', err => reject(err));

      output.on('open', () => {
        zip.pipe(output);

        // normalize both maps to avoid problems with e.g. Path Separators in different shells
        const normalizedFiles = _.uniq(files.map(file => path.normalize(file)));
        const normalizedFilesToChmodPlusX =
          filesToChmodPlusX && _.uniq(filesToChmodPlusX.map(file => path.normalize(file)));

        return Promise.all(normalizedFiles.map(this.getFileContentAndStat.bind(this)))
          .then(contents => {
            contents
              .sort((content1, content2) => content1.filePath.localeCompare(content2.filePath))
              .forEach(file => {
                const name = file.filePath.slice(prefix ? `${prefix}${path.sep}`.length : 0);
                // Ensure file is executable if it is locally executable or
                // it's forced (via normalizedFilesToChmodPlusX) to be executable
                const mode =
                  file.stat.mode & 0o100 ||
                  (normalizedFilesToChmodPlusX && normalizedFilesToChmodPlusX.includes(name))
                    ? 0o755
                    : 0o644;
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

  async getFileContentAndStat(filePath) {
    const fullPath = path.resolve(this.serverless.config.servicePath, filePath);
    const statAsync = util.promisify(fs.stat);

    return Promise.all([
      // Get file contents and stat in parallel
      this.getFileContent(fullPath),
      statAsync(fullPath),
    ]).then(result => ({
      data: result[0],
      stat: result[1],
      filePath,
    }));
  },

  // Useful point of entry for e.g. transpilation plugins
  async getFileContent(fullPath) {
    const readFileAsync = util.promisify(fs.readFile);

    return readFileAsync(fullPath);
  },
};

async function excludeNodeDevDependencies(servicePath) {
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
    const packageJsonPaths = packageJsonFilePaths.filter(filePath => {
      const isNodeModulesDir = !!filePath.match(/node_modules/);
      return !isNodeModulesDir;
    });

    if (!packageJsonPaths.length) {
      return Promise.resolve(exAndIn);
    }

    // NOTE: using mapSeries here for a sequential computation (w/o race conditions)
    return await mapPromiseSeries(packageJsonPaths, async packageJsonPath => {
      // the path where the package.json file lives
      const fullPath = path.join(servicePath, packageJsonPath);

      const dirWithPackageJson = fullPath.replace(path.join(path.sep, 'package.json'), '');

      // we added a catch which resolves so that npm commands with an exit code of 1
      // (e.g. if the package.json is invalid) won't crash the dev dependency exclusion process
      return Promise.allSettled(
        ['dev', 'prod'].map(async env => {
          const depFile = env === 'dev' ? nodeDevDepFile : nodeProdDepFile;
          const execAsync = util.promisify(childProcess.exec);

          return await execAsync(
            `npm ls --${env}=true --parseable=true --long=false --silent >> ${depFile}`,
            { cwd: dirWithPackageJson }
          ).catch(() => Promise.resolve());
        })
      );
    })
      // NOTE: using mapSeries here for a sequential computation (w/o race conditions)
      .then(() =>
        mapPromiseSeries(['dev', 'prod'], async env => {
          const depFile = env === 'dev' ? nodeDevDepFile : nodeProdDepFile;
          const readFileAsync = util.promisify(fs.readFile);

          return readFileAsync(depFile)
            .then(fileContent => _.uniq(fileContent.toString('utf8').split('\n')).filter(Boolean))
            .catch(() => Promise.resolve());
        })
      )
      .then(devAndProDependencies => {
        const devDependencies = devAndProDependencies[0];
        const prodDependencies = devAndProDependencies[1];

        // NOTE: the order for _.difference is important
        const dependencies = _.difference(devDependencies, prodDependencies);
        const nodeModulesRegex = new RegExp(`${path.join('node_modules', path.sep)}.*`, 'g');

        if (dependencies.length) {
          return Promise.allSettled(
            dependencies
              .map(item => item.replace(path.join(servicePath, path.sep), ''))
              .filter(item => item.length > 0 && item.match(nodeModulesRegex))
              .map(async item => {
                const packagePath = path.join(servicePath, item, 'package.json');
                const readFileAsync = util.promisify(fs.readFile);

                return await readFileAsync(packagePath, 'utf-8').then(
                  packageJsonFile => {
                    const lastIndex = item.lastIndexOf(path.sep) + 1;
                    const moduleName = item.substr(lastIndex);
                    const modulePath = item.substr(0, lastIndex);

                    const packageJson = JSON.parse(packageJsonFile);
                    const bin = packageJson.bin;

                    const baseGlobs = [path.join(item, '**')];

                    // NOTE: pkg.bin can be object, string, or undefined
                    if (typeof bin === 'object') {
                      Object.keys(bin).forEach(executable => {
                        baseGlobs.push(path.join(modulePath, '.bin', executable));
                      });
                      // only 1 executable with same name as lib
                    } else if (typeof bin === 'string') {
                      baseGlobs.push(path.join(modulePath, '.bin', moduleName));
                    }

                    return baseGlobs;
                  },
                  () => []
                );
              })
          )
            .then(results => {
              return results.reduce((arr, result) => [...arr, ...result.value], []);
            })
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
      .catch(() => exAndIn);
  } catch (e) {
    // fail silently
    return Promise.resolve(exAndIn);
  }
}
