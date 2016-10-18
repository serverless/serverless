'use strict';

const BbPromise = require('bluebird');
const findAndGroupStacks = require('../utils/findAndGroupStacks');

module.exports = {
  listStacks() {
    const service = this.serverless.service.service;
    const stage = this.options.stage;

    return this.sdk.request('S3',
      'listObjectsV2',
      {
        Bucket: this.bucketName,
        Prefix: `serverless/${service}/${stage}`,
      },
      this.options.stage,
      this.options.region)
      .then((response) => {
        const directoryRegex = new RegExp('(.+)-(.+-.+-.+)');
        const stacks = findAndGroupStacks(response, service, stage);

        if (stacks.length === 0) {
          this.serverless.cli.log('Couldn\'t find any existing stacks.');
          this.serverless.cli.log('Please verify that stage and region are correct.');
          return BbPromise.resolve();
        }
        this.serverless.cli.log('Listing deployed stacks:');
        stacks.forEach((stack) => {
          this.serverless.cli.log('-------------');
          const match = stack[0].directory.match(directoryRegex);
          this.serverless.cli.log(`Timestamp: ${match[1]}`);
          this.serverless.cli.log(`Datetime: ${match[2]}`);
          this.serverless.cli.log('Files:');
          stack.forEach((entry) => {
            this.serverless.cli.log(`- ${entry.file}`);
          });
        });
        return BbPromise.resolve();
      });
  },
};
