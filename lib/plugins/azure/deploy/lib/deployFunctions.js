'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const last = require('lodash').last;
const union = require('lodash').union;
const Zip = require('node-zip');

module.exports = {
  extractFunctionHandlers() {
    this.deployedFunctions = [];

    forEach(this.serverless.service.functions, (value, key) => {
      if (key !== 'name_template') {
        this.deployedFunctions.push({
          name: key,
          handler: value.handler,
          exclude: value.exclude,
          include: value.include,
        });
      }
    });

    return BbPromise.resolve();
  },

  zipFunctions() {
    this.serverless.cli.log('Zipping functions...');
    this.deployedFunctions.forEach((func, index) => {
      // create a new zip instance so that old functions won't slip into the new zip archive
      const zip = new Zip();

      const servicePath = this.serverless.config.servicePath;

      let exclude = func.exclude || [];

      // add defaults for exclude
      exclude = union(exclude, [
        '.git',
        '.gitignore',
        '.DS_Store',
        'serverless.yaml',
        'serverless.env.yaml',
      ]);

      const include = func.include || [];

      const handler = (last(func.handler.split('/'))).replace(/\\g/, '/');
      const handlerFullPath = path.join(servicePath, handler);

      if (!handlerFullPath.endsWith(func.handler)) {
        throw new this.serverless.classes.Error(`The handler ${func.handler} was not found`);
      }

      const packageRoot = handlerFullPath.replace(func.handler, '');

      this.serverless.utils.walkDirSync(packageRoot).forEach((filePath) => {
        const relativeFilePath = path.relative(packageRoot, filePath);

        const shouldBeExcluded = exclude.some(sRegex => {
          const regex = new RegExp(sRegex);
          const matches = regex.exec(relativeFilePath);
          return matches && matches.length > 0;
        });

        const shouldBeIncluded = include.some(sRegex => {
          const regex = new RegExp(sRegex);
          const matches = regex.exec(relativeFilePath);
          return matches && matches.length > 0;
        });

        if (!shouldBeExcluded || shouldBeIncluded) {
          zip.file(relativeFilePath, fs.readFileSync(filePath));
        }
      });

      const data = zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        platform: process.platform,
      });

      this.deployedFunctions[index].zipFileData = data;
      this.deployedFunctions[index].zipFileKey = zipFileName;
    });

    return BbPromise.resolve();
  },

  uploadZipFiles() {
    this.serverless.cli.log('Uploading zip files to Azure...');
    const bucketName =
      `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;
    const uploadPromises = [];

    this.deployedFunctions.forEach(func => {
      // Todo: Upload each function

      uploadPromises.push(putObjectPromise);
    });

    return BbPromise.all(uploadPromises);
  },

  deployFunctions() {
    // Todo: Make all of this work
    return BbPromise.bind(this)
      .then(this.extractFunctionHandlers)
      .then(this.zipFunctions)
      .then(this.uploadZipFiles);
  },
};
