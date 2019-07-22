'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const chalk = require('chalk');
const userStats = require('../../../utils/userStats');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      const error = new this.serverless.classes.Error(
        'This command can only be run inside a service directory'
      );
      return Promise.reject(error);
    }

    this.options.stage = this.provider.getStage();
    this.options.region = this.provider.getRegion();
    const creds = { ...this.provider.getCredentials() };
    delete creds.region;
    delete creds.signatureVersion;
    if (
      Object.keys(creds).length === 0 &&
      !process.env.ECS_CONTAINER_METADATA_FILE &&
      !process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI &&
      !process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI
    ) {
      // first check if the EC2 Metadata Service has creds before throwing error
      const metadataService = new AWS.MetadataService({
        httpOptions: { timeout: 100, connectTimeout: 100 }, // .1 second timeout
        maxRetries: 0, // retry 0 times
      });
      return new BbPromise((resolve, reject) =>
        metadataService.request('/', (err, data) => {
          return err ? reject(err) : resolve(data);
        })
      )
        .catch(() => null)
        .then(identity => {
          if (!identity) {
            const message = [
              'AWS provider credentials not found.',
              ' Learn how to set up AWS provider credentials',
              ` in our docs here: <${chalk.green('http://bit.ly/aws-creds-setup')}>.`,
            ].join('');
            userStats.track('user_awsCredentialsNotFound');
            throw new this.serverless.classes.Error(message);
          }
        });
    }
    return Promise.resolve();
  },
};
