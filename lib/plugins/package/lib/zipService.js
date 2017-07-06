'use strict';

/* eslint-disable no-use-before-define */
/* eslint-disable no-param-reassign */
/* eslint-disable consistent-return */

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
      return BbPromise.bind(this)
        .then(() => excludeNodeDevDependencies(servicePath))
        .then((exAndInNode) => {
          params.exclude = _.union(params.exclude, exAndInNode.exclude);
          params.include = _.union(params.include, exAndInNode.include);
          return params;
        })
        .catch(() => params);
    }

    return BbPromise.resolve(params);
  },

  zip(params) {
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

    const zip = archiver.create('zip');
    // Create artifact in temp path and move it to the package path (if any) later
    const artifactFilePath = path.join(this.serverless.config.servicePath,
      '.serverless',
      params.zipFileName
    );
    this.serverless.utils.writeFileDir(artifactFilePath);

    const output = fs.createWriteStream(artifactFilePath);

    const files = globby.sync(patterns, {
      cwd: this.serverless.config.servicePath,
      dot: true,
      silent: true,
      follow: true,
    });

    if (files.length === 0) {
      const error = new this.serverless
        .classes.Error('No file matches include / exclude patterns');
      return BbPromise.reject(error);
    }

    output.on('open', () => {
      zip.pipe(output);

      files.forEach((filePath) => {
        const fullPath = path.resolve(
          this.serverless.config.servicePath,
          filePath
        );

        const stats = fs.statSync(fullPath);

        if (!stats.isDirectory(fullPath)) {
          zip.append(fs.readFileSync(fullPath), {
            name: filePath,
            mode: stats.mode,
            date: new Date(0), // necessary to get the same hash when zipping the same content
          });
        }
      });

      zip.finalize();
    });

    return new BbPromise((resolve, reject) => {
      output.on('close', () => resolve(artifactFilePath));
      zip.on('error', (err) => reject(err));
    });
  },
};

function excludeNodeDevDependencies(servicePath) {
  const exAndIn = {
    include: [],
    exclude: [],
  };

  // the file where we'll write the dependencies into
  const nodeDevDepFile = path.join(
    os.tmpdir(),
    `node-dev-dependencies-${crypto.randomBytes(8).toString('hex')}`
  );

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

    // NOTE: using mapSeries here for a sequential computation (w/o race conditions)
    return BbPromise.mapSeries(packageJsonPaths, (packageJsonPath) => {
      // the path where the package.json file lives
      const fullPath = path.join(servicePath, packageJsonPath);
      const dirWithPackageJson = fullPath.replace(path.join(path.sep, 'package.json'), '');

      return childProcess.execAsync(
        `npm ls --dev=true --parseable=true --silent >> ${nodeDevDepFile}`,
        { cwd: dirWithPackageJson }
      );
    })
    .then(() => fs.readFileAsync(nodeDevDepFile))
    .then((fileContent) => {
      const dependencies = fileContent.toString('utf8').split('\n');
      const nodeModulesRegex = new RegExp(`${path.join('node_modules', path.sep)}.*`, 'g');

      if (dependencies.length) {
        const globs = dependencies
          .map((item) => item.replace(servicePath, ''))
          .filter((item) => item.length > 0 && item.match(nodeModulesRegex))
          .map((item) => `${item.substring(1)}/**`);
        exAndIn.exclude = globs;
      }

      return exAndIn;
    })
    .catch(() => exAndIn);
  } catch (e) {
    // fail silently
  }
}
