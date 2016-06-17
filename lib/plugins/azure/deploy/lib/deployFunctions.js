'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const last = require('lodash').last;
const union = require('lodash').union;
const Zip = require('node-zip');
const fetch = require('node-fetch');

fetch.Promise = BbPromise;

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
      const normalizedHandler = path.normalize(func.handler);

      if (!handlerFullPath.endsWith(normalizedHandler)) {
        throw new this.serverless.classes.Error(`The handler ${func.handler} was not found`);
      }

      const packageRoot = handlerFullPath.replace(normalizedHandler, '');

      // Add function files
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

      // Add functions.json
      const functionsJson = this.serverless.service.resources.azure.functions[func.name];
      zip.file('function.json', JSON.stringify(functionsJson));

      // Create zipped data
      const data = zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        platform: process.platform,
      });

      this.deployedFunctions[index].zipFileData = data;
    });

    return BbPromise.resolve();
  },

  uploadZipFiles() {
    this.serverless.cli.log('Uploading zip files to Azure...');
    const targetWebsite = this.serverless.service.resources.azure.variables.sitename;
    const user = process.env.AZURE_USERNAME;
    const pass = process.env.AZURE_PASSWORD;
    const targetUrl = `https://${user}:${pass}@${targetWebsite}.scm.azurewebsites.net`;
    const uploadPromises = [];

    if (!user || !pass) {
      const msg = 'Environment variables AZURE_PASSWORD and AZURE_USERNAME not found';
      throw new this.serverless.classes.Error(msg);
    }

    this.deployedFunctions.forEach(func => {
      uploadPromises.push(this.uploadZipData(func, targetUrl, func.zipFileData));
    });
    this.createHostFile();

    return BbPromise.all(uploadPromises);
  },

  uploadZipData(func, targetWebsite, data) {
    return new BbPromise((resolve, reject) => {
      const createUrl = `${targetWebsite}/api/vfs/site/wwwroot/${func.handler}/`;
      const uploadUrl = `${targetWebsite}/api/zip/site/wwwroot/${func.handler}/`;

      fetch(createUrl)
        .then(() => fetch(uploadUrl, {
            method: 'PUT',
            body: data,
          })
        )
        .catch(err => reject(err));
    });
  },

  createHostFile(targetWebsite) {
    const createUrl = `${targetWebsite}/api/vfs/site/wwwroot/host.json`;

    return fetch(createUrl, {
      method: 'PUT',
      body: '{}',
    });
  },

  deployFunctions() {
    return BbPromise.bind(this)
      .then(this.extractFunctionHandlers)
      .then(this.zipFunctions)
      .then(this.uploadZipFiles);
  },
};
