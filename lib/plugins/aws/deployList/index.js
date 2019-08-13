'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const validate = require('../lib/validate');
const findAndGroupDeployments = require('../utils/findAndGroupDeployments');
const setBucketName = require('../lib/setBucketName');

class AwsDeployList {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, setBucketName);

    this.hooks = {
      'before:deploy:list:log': () => BbPromise.bind(this).then(this.validate),
      'before:deploy:list:functions:log': () => BbPromise.bind(this).then(this.validate),

      'deploy:list:log': () =>
        BbPromise.bind(this)
          .then(this.setBucketName)
          .then(this.listDeployments),
      'deploy:list:functions:log': () => BbPromise.bind(this).then(this.listFunctions),
    };
  }

  listDeployments() {
    const service = this.serverless.service.service;
    const stage = this.provider.getStage();
    const prefix = this.provider.getDeploymentPrefix();

    return this.provider
      .request('S3', 'listObjectsV2', {
        Bucket: this.bucketName,
        Prefix: `${prefix}/${service}/${stage}`,
      })
      .then(response => {
        const directoryRegex = new RegExp('(.+)-(.+-.+-.+)');
        const deployments = findAndGroupDeployments(response, prefix, service, stage);

        if (deployments.length === 0) {
          this.serverless.cli.log("Couldn't find any existing deployments.");
          this.serverless.cli.log('Please verify that stage and region are correct.');
          return BbPromise.resolve();
        }
        this.serverless.cli.log('Listing deployments:');
        deployments.forEach(deployment => {
          this.serverless.cli.log('-------------');
          const match = deployment[0].directory.match(directoryRegex);
          this.serverless.cli.log(`Timestamp: ${match[1]}`);
          this.serverless.cli.log(`Datetime: ${match[2]}`);
          this.serverless.cli.log('Files:');
          deployment.forEach(entry => {
            this.serverless.cli.log(`- ${entry.file}`);
          });
        });
        return BbPromise.resolve();
      });
  }

  // list all functions and their versions
  listFunctions() {
    return BbPromise.resolve()
      .bind(this)
      .then(this.getFunctions)
      .then(this.getFunctionVersions)
      .then(this.displayFunctions);
  }

  getFunctions() {
    const funcs = this.serverless.service.getAllFunctionsNames();

    return BbPromise.map(funcs, funcName => {
      const params = {
        FunctionName: funcName,
      };

      return this.provider.request('Lambda', 'getFunction', params);
    }).then(result => _.map(result, item => item.Configuration));
  }

  getFunctionPaginatedVersions(params, totalVersions) {
    return this.provider.request('Lambda', 'listVersionsByFunction', params).then(response => {
      const Versions = (totalVersions || []).concat(response.Versions);
      if (response.NextMarker) {
        return this.getFunctionPaginatedVersions(
          Object.assign({}, params, { Marker: response.NextMarker }),
          Versions
        );
      }

      return Promise.resolve({ Versions });
    });
  }

  getFunctionVersions(funcs) {
    const requestPromises = [];

    funcs.forEach(func => {
      const params = {
        FunctionName: func.FunctionName,
      };

      requestPromises.push(this.getFunctionPaginatedVersions(params));
    });

    return BbPromise.all(requestPromises);
  }

  displayFunctions(funcs) {
    this.serverless.cli.log('Listing functions and their last 5 versions:');
    this.serverless.cli.log('-------------');

    funcs.forEach(func => {
      let message = '';

      let name = func.Versions[0].FunctionName;
      name = name.replace(`${this.serverless.service.service}-`, '');
      name = name.replace(`${this.provider.getStage()}-`, '');

      message += `${name}: `;
      const versions = func.Versions.map(funcEntry => funcEntry.Version).slice(
        Math.max(0, func.Versions.length - 5)
      );

      message += versions.join(', ');
      this.serverless.cli.log(message);
    });

    return BbPromise.resolve();
  }
}

module.exports = AwsDeployList;
