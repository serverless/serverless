'use strict';

/* eslint-disable no-use-before-define */

const BbPromise = require('bluebird');
const archiver = require('archiver');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = BbPromise.promisifyAll(require('graceful-fs'));
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
        .then((exAndInNode) => {
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
      this.zipFiles(filePaths, params.zipFileName));
  },

  zipFiles(files, zipFileName) {
    if (files.length === 0) {
      const error = new this.serverless.classes.Error('No files to package');
      return BbPromise.reject(error);
    }

    const zip = archiver.create('zip');
    // Create artifact in temp path and move it to the package path (if any) later
    const artifactFilePath = path.join(this.serverless.config.servicePath,
      '.serverless',
      zipFileName
    );
    this.serverless.utils.writeFileDir(artifactFilePath);

    const output = fs.createWriteStream(artifactFilePath);

    return new BbPromise((resolve, reject) => {
      output.on('close', () => resolve(artifactFilePath));
      output.on('error', (err) => reject(err));
      zip.on('error', (err) => reject(err));


      output.on('open', () => {
        zip.pipe(output);

        BbPromise.all(files.map((filePath) => {
          const fullPath = path.resolve(
            this.serverless.config.servicePath,
            filePath
          );

          return fs.statAsync(fullPath).then(stats =>
            this.getFileContent(fullPath).then(fileContent =>
              zip.append(fileContent, {
                name: filePath,
                mode: stats.mode,
                date: new Date(0), // necessary to get the same hash when zipping the same content
              })
            )
          );
        })).then(() => zip.finalize()).catch(reject);
      });
    });
  },

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
    const packageJsonFilePaths = globby.sync([
      '**/package.json',
      // TODO add glob for node_modules filtering
    ], {
      cwd: servicePath,
      dot: true,
      silent: true,
      follow: true,
      nosort: true,
    });

    // filter out non node_modules file paths
    const packageJsonPaths = _.filter(packageJsonFilePaths, (filePath) => {
      const isNodeModulesDir = !!filePath.match(/node_modules/);
      return !isNodeModulesDir;
    });

    if (_.isEmpty(packageJsonPaths)) {
      return BbPromise.resolve(exAndIn);
    }

    // NOTE: using mapSeries here for a sequential computation (w/o race conditions)
    return BbPromise.mapSeries(packageJsonPaths, (packageJsonPath) => {
      // the path where the package.json file lives
      const fullPath = path.join(servicePath, packageJsonPath);
      const dirWithPackageJson = fullPath.replace(path.join(path.sep, 'package.json'), '');

      // we added a catch which resolves so that npm commands with an exit code of 1
      // (e.g. if the package.json is invalid) won't crash the dev dependency exclusion process
      return BbPromise.map(['dev', 'prod'], (env) => {
        const depFile = env === 'dev' ? nodeDevDepFile : nodeProdDepFile;
        return childProcess.execAsync(
          `npm ls --${env}=true --parseable=true --long=false --silent >> ${depFile}`,
          { cwd: dirWithPackageJson }
        ).catch(() => BbPromise.resolve());
      });
    })
    // NOTE: using mapSeries here for a sequential computation (w/o race conditions)
    .then(() => BbPromise.mapSeries(['dev', 'prod'], (env) => {
      const depFile = env === 'dev' ? nodeDevDepFile : nodeProdDepFile;
      return fs.readFileAsync(depFile)
        .then((fileContent) => _.compact(
          (_.uniq(_.split(fileContent.toString('utf8'), '\n'))),
          elem => elem.length > 0
        )).catch(() => BbPromise.resolve());
    }))
    .then((devAndProDependencies) => {
      const devDependencies = devAndProDependencies[0];
      const prodDependencies = devAndProDependencies[1];

      // NOTE: the order for _.difference is important
      const dependencies = _.difference(devDependencies, prodDependencies);
      const nodeModulesRegex = new RegExp(`${path.join('node_modules', path.sep)}.*`, 'g');

      if (!_.isEmpty(dependencies)) {
        const globs = dependencies
          .map((item) => item.replace(path.join(servicePath, path.sep), ''))
          .filter((item) => item.length > 0 && item.match(nodeModulesRegex))
          .map((item) => `${item}/**`);
        exAndIn.exclude = globs;
      }

      return exAndIn;
    })
    .catch(() => exAndIn);
  } catch (e) {
    // fail silently
  }
}
