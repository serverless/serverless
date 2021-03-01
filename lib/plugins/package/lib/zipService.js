'use strict';

const archiver = require('archiver');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { promisify } = require('util');
const { exec } = require('child_process');
const globby = require('globby');
const _ = require('lodash');
const ServerlessError = require('../../../serverless-error');

const fsAsync = fs.promises;
const execAsync = promisify(exec);
const excludeNodeDevDependenciesMemoized = _.memoize(excludeNodeDevDependencies);

module.exports = {
  async zipService(exclude, include, zipFileName) {
    const params = await this.excludeDevDependencies({
      exclude,
      include,
      zipFileName,
    });
    return this.zip(params);
  },

  async excludeDevDependencies(params) {
    const servicePath = this.serverless.config.servicePath;

    let excludeDevDependencies = this.serverless.service.package.excludeDevDependencies;
    if (excludeDevDependencies === undefined || excludeDevDependencies === null) {
      excludeDevDependencies = true;
    }

    if (excludeDevDependencies) {
      this.serverless.cli.log('Excluding development dependencies...');

      const exAndInNode = await excludeNodeDevDependenciesMemoized(servicePath);
      params.exclude = _.union(params.exclude, exAndInNode.exclude); //eslint-disable-line
      params.include = _.union(params.include, exAndInNode.include); //eslint-disable-line
    }

    return params;
  },

  async zip(params) {
    const filePaths = await this.resolveFilePathsFromPatterns(params);
    return this.zipFiles(filePaths, params.zipFileName);
  },

  /**
   * Create a zip file on disk from an array of filenames of files on disk
   * @param files - an Array of filenames
   * @param zipFiles - the filename to save the zip at
   * @param prefix - a prefix to strip from the file names. use for layers support
   */
  async zipFiles(files, zipFileName, prefix) {
    if (files.length === 0) {
      throw new ServerlessError('No files to package');
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
      output.on('error', (err) => reject(err));
      zip.on('error', (err) => reject(err));

      output.on('open', async () => {
        zip.pipe(output);

        // normalize both maps to avoid problems with e.g. Path Separators in different shells
        const normalizedFiles = _.uniq(files.map((file) => path.normalize(file)));

        try {
          const contents = await Promise.all(
            normalizedFiles.map(this.getFileContentAndStat.bind(this))
          );
          contents
            .sort((content1, content2) => content1.filePath.localeCompare(content2.filePath))
            .forEach((file) => {
              const name = file.filePath.slice(prefix ? `${prefix}${path.sep}`.length : 0);
              // Ensure file is executable if it is locally executable or
              // it's forced (via normalizedFilesToChmodPlusX) to be executable
              const mode = file.stat.mode & 0o100 || process.platform === 'win32' ? 0o755 : 0o644;
              zip.append(file.data, {
                name,
                mode,
                date: new Date(0), // necessary to get the same hash when zipping the same content
              });
            });

          zip.finalize();
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  async getFileContentAndStat(filePath) {
    const fullPath = path.resolve(this.serverless.config.servicePath, filePath);

    try {
      const result = await Promise.all([
        // Get file contents and stat in parallel
        this.getFileContent(fullPath),
        fsAsync.stat(fullPath),
      ]);
      return {
        data: result[0],
        stat: result[1],
        filePath,
      };
    } catch (error) {
      throw new ServerlessError(`Cannot read file ${filePath} due to: ${error.message}`);
    }
  },

  // Useful point of entry for e.g. transpilation plugins
  getFileContent(fullPath) {
    return fsAsync.readFile(fullPath);
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
    const packageJsonPaths = packageJsonFilePaths.filter((filePath) => {
      const isNodeModulesDir = !!filePath.match(/node_modules/);
      return !isNodeModulesDir;
    });

    if (!packageJsonPaths.length) {
      return exAndIn;
    }

    const devAndProDependencies = [];
    for (const env of ['dev', 'prod']) {
      const depFile = env === 'dev' ? nodeDevDepFile : nodeProdDepFile;
      for (const packageJsonPath of packageJsonPaths) {
        // the path where the package.json file lives
        const fullPath = path.join(servicePath, packageJsonPath);
        const dirWithPackageJson = fullPath.replace(path.join(path.sep, 'package.json'), '');
        try {
          await execAsync(
            `npm ls --${env}=true --parseable=true --long=false --silent --all >> ${depFile}`,
            { cwd: dirWithPackageJson }
          );
        } catch {
          // ignore error
        }
      }
      try {
        const fileContent = await fsAsync.readFile(depFile);
        devAndProDependencies.push(
          _.uniq(fileContent.toString('utf8').split(/[\r\n]+/)).filter(Boolean)
        );
      } catch {
        // ignore error
      }
    }
    const devDependencies = devAndProDependencies[0];
    const prodDependencies = devAndProDependencies[1];

    // NOTE: the order for _.difference is important
    const dependencies = _.difference(devDependencies, prodDependencies);
    const nodeModulesRegex = new RegExp(`${path.join('node_modules', path.sep)}.*`, 'g');

    if (dependencies.length) {
      const items = await Promise.all(
        dependencies.map((item) => item.replace(path.join(servicePath, path.sep), ''))
      );

      const filteredItems = items.filter((item) => item.length > 0 && item.match(nodeModulesRegex));
      const globs = [];
      for (const item of filteredItems) {
        const packagePath = path.join(servicePath, item, 'package.json');
        try {
          const packageJsonFile = await fsAsync.readFile(packagePath, 'utf-8');
          const lastIndex = item.lastIndexOf(path.sep) + 1;
          const moduleName = item.substr(lastIndex);
          const modulePath = item.substr(0, lastIndex);

          const packageJson = JSON.parse(packageJsonFile);
          const bin = packageJson.bin;

          const baseGlobs = [path.join(item, '**')];

          // NOTE: pkg.bin can be object, string, or undefined
          if (typeof bin === 'object') {
            Object.keys(bin).forEach((executable) => {
              baseGlobs.push(path.join(modulePath, '.bin', executable));
            });
            // only 1 executable with same name as lib
          } else if (typeof bin === 'string') {
            baseGlobs.push(path.join(modulePath, '.bin', moduleName));
          }

          globs.push(...baseGlobs);
        } catch {
          // ignore error
        }
      }
      exAndIn.exclude = exAndIn.exclude.concat(globs);
    }
    // cleanup
    fs.unlinkSync(nodeDevDepFile);
    fs.unlinkSync(nodeProdDepFile);
  } catch (e) {
    // fail silently
  }
  return exAndIn;
}
