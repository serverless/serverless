'use strict';

const BbPromise = require('bluebird');
const ServerlessError = require('../../../../serverless-error');

module.exports = {
  async existsDeploymentBucket(bucketName) {
    return BbPromise.resolve()
      .then(() =>
        this.provider.request('S3', 'getBucketLocation', {
          Bucket: bucketName,
        })
      )
      .then((resultParam) => {
        const result = resultParam;
        if (result.LocationConstraint === '') result.LocationConstraint = 'us-east-1';
        if (result.LocationConstraint === 'EU') result.LocationConstraint = 'eu-west-1';
        if (result.LocationConstraint !== this.provider.getRegion()) {
          throw new ServerlessError(
            'Deployment bucket is not in the same region as the lambda function'
          );
        }
        return BbPromise.resolve();
      })
      .catch((err) => {
        throw new ServerlessError(`Could not locate deployment bucket. Error: ${err.message}`);
      });
  },
};
