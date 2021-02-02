'use strict';

const validate = require('./lib/validate');
const findAndGroupDeployments = require('./utils/findAndGroupDeployments');
const setBucketName = require('./lib/setBucketName');

class AwsDeployList {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, setBucketName);

    this.hooks = {
      'before:deploy:list:log': () => this.validate(),
      'before:deploy:list:functions:log': () => this.validate(),

      'deploy:list:log': async () => {
        await this.setBucketName();
        await this.listDeployments();
      },
      'deploy:list:functions:log': async () => this.listFunctions(),
    };
  }

  async listDeployments() {
    const service = this.serverless.service.service;
    const stage = this.provider.getStage();
    const prefix = this.provider.getDeploymentPrefix();

    const response = await this.provider.request('S3', 'listObjectsV2', {
      Bucket: this.bucketName,
      Prefix: `${prefix}/${service}/${stage}`,
    });

    const directoryRegex = new RegExp('(.+)-(.+-.+-.+)');
    const deployments = findAndGroupDeployments(response, prefix, service, stage);

    if (deployments.length === 0) {
      this.serverless.cli.log("Couldn't find any existing deployments.");
      this.serverless.cli.log('Please verify that stage and region are correct.');
      return;
    }

    this.serverless.cli.log('Listing deployments:');
    deployments.forEach((deployment) => {
      this.serverless.cli.log('-------------');
      const match = deployment[0].directory.match(directoryRegex);
      this.serverless.cli.log(`Timestamp: ${match[1]}`);
      this.serverless.cli.log(`Datetime: ${match[2]}`);
      this.serverless.cli.log('Files:');
      deployment.forEach((entry) => {
        this.serverless.cli.log(`- ${entry.file}`);
      });
    });
  }

  // list all functions and their versions
  async listFunctions() {
    const funcs = await this.getFunctions();
    const funcsVersions = await this.getFunctionVersions(funcs);
    this.displayFunctions(funcsVersions);
  }

  async getFunctions() {
    const funcs = this.serverless.service.getAllFunctionsNames();

    const result = await Promise.all(
      funcs.map((funcName) => {
        const params = {
          FunctionName: funcName,
        };

        return this.provider.request('Lambda', 'getFunction', params);
      })
    );

    return result.map((item) => item.Configuration);
  }

  async getFunctionPaginatedVersions(params, totalVersions) {
    const response = await this.provider.request('Lambda', 'listVersionsByFunction', params);

    const Versions = (totalVersions || []).concat(response.Versions);
    if (response.NextMarker) {
      return this.getFunctionPaginatedVersions(
        { ...params, Marker: response.NextMarker },
        Versions
      );
    }

    return { Versions };
  }

  async getFunctionVersions(funcs) {
    return Promise.all(
      funcs.map((func) => {
        const params = {
          FunctionName: func.FunctionName,
        };

        return this.getFunctionPaginatedVersions(params);
      })
    );
  }

  displayFunctions(funcs) {
    this.serverless.cli.log('Listing functions and their last 5 versions:');
    this.serverless.cli.log('-------------');

    funcs.forEach((func) => {
      let message = '';

      let name = func.Versions[0].FunctionName;
      name = name.replace(`${this.serverless.service.service}-`, '');
      name = name.replace(`${this.provider.getStage()}-`, '');

      message += `${name}: `;
      const versions = func.Versions.map((funcEntry) => funcEntry.Version).slice(
        Math.max(0, func.Versions.length - 5)
      );

      message += versions.join(', ');
      this.serverless.cli.log(message);
    });
  }
}

module.exports = AwsDeployList;
