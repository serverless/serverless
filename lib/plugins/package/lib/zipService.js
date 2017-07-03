'use strict';

/* eslint-disable no-use-before-define */
/* eslint-disable no-param-reassign */

const childProcess = require('child_process');
const archiver = require('archiver');
const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
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
      const exAndInNode = excludeNodeDevDependencies(servicePath);

      params.exclude = _.union(params.exclude, exAndInNode.exclude);
      params.include = _.union(params.include, exAndInNode.include);
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
  const cwd = process.cwd();
  let exclude = [];
  let include = [];

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
    const relevantFilePaths = _.filter(packageJsonFilePaths, (filePath) => {
      const isNodeModulesDir = !!filePath.match(/node_modules/);
      return !isNodeModulesDir;
    });

    _.forEach(relevantFilePaths, (relevantFilePath) => {
      // the path where the package.json file lives
      const fullPath = path.join(servicePath, relevantFilePath);
      const rootDirPath = fullPath.replace(path.join(path.sep, 'package.json'), '');

      process.chdir(rootDirPath);

      // TODO replace with package-manager independent directory traversal?!
      const prodDependencies = childProcess
        .execSync('npm ls --prod=true --parseable=true --silent')
        .toString().trim();

      const nodeModulesRegex = new RegExp(`${path.join('node_modules', path.sep)}.*`, 'g');
      const prodDependencyPaths = prodDependencies.match(nodeModulesRegex);

      let pathToDep = '';
      // if the package.json file is not in the root of the service path
      if (rootDirPath !== servicePath) {
        // the path without the servicePath prepended
        const relativeFilePath = rootDirPath.replace(path.join(servicePath, path.sep), '');
        pathToDep = relativeFilePath ? `${relativeFilePath}/` : '';
      }

      const includePatterns = _.map(prodDependencyPaths, (depPath) =>
        `${pathToDep}${depPath}/**`);

      if (includePatterns.length) {
        // at first exclude the whole node_modules directory
        // after that re-include the production relevant modules
        exclude = _.union(exclude, [`${pathToDep}node_modules/**`]);
        include = _.union(include, includePatterns);
      }
    });
  } catch (e) {
    // npm is not installed
  } finally {
    // make sure to always chdir back to the cwd, no matter what
    process.chdir(cwd);
  }

  return {
    exclude,
    include,
  };
}
