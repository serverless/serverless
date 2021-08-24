'use strict';

const validate = require('./lib/validate');
const setBucketName = require('./lib/setBucketName');
const findDeployments = require('./lib/findDeployments');

class AwsDeployList {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, setBucketName, findDeployments);

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
    const deployments = await this.findDeployments();

    if (deployments.length === 0) {
      this.serverless.cli.log("Couldn't find any existing deployments.");
      this.serverless.cli.log('Please verify that stage and region are correct.');
      return;
    }

    this.serverless.cli.log('Listing deployments:');
    deployments.forEach(({ timestamp, datetime, artifactNames }) => {
      this.serverless.cli.log('-------------');
      this.serverless.cli.log(`Timestamp: ${timestamp}`);
      this.serverless.cli.log(`Datetime: ${datetime}`);
      this.serverless.cli.log('Files:');
      artifactNames.forEach((artifact) => this.serverless.cli.log(`- ${artifact}`));
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
