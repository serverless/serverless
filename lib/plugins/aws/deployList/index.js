'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const findAndGroupDeployments = require('../utils/findAndGroupDeployments');
const setBucketName = require('../lib/setBucketName');

class AwsDeployList {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      setBucketName
    );

    this.hooks = {
      'before:deploy:list:log': () => BbPromise.bind(this)
          .then(this.validate),
      'deploy:list:log': () => BbPromise.bind(this)
        .then(this.setBucketName)
        .then(this.listDeployments),
    };
  }

  listDeployments() {
    const service = this.serverless.service.service;
    const stage = this.options.stage;

    return this.provider.request('S3',
      'listObjectsV2',
      {
        Bucket: this.bucketName,
        Prefix: `serverless/${service}/${stage}`,
      },
      this.options.stage,
      this.options.region)
      .then((response) => {
        const directoryRegex = new RegExp('(.+)-(.+-.+-.+)');
        const deployments = findAndGroupDeployments(response, service, stage);

        if (deployments.length === 0) {
          this.serverless.cli.log('Couldn\'t find any existing deployments.');
          this.serverless.cli.log('Please verify that stage and region are correct.');
          return BbPromise.resolve();
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
        return BbPromise.resolve();
      });
  }
}

module.exports = AwsDeployList;
