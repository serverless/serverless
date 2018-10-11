'use strict';

const BbPromise = require('bluebird');

module.exports = {
  existsDeploymentBucket(bucketName) {
    return BbPromise.resolve()
      .then(() => this.provider.request('S3',
        'getBucketLocation',
        {
          Bucket: bucketName,
        }
      ))
      .then(resultParam => {
        const result = resultParam;
        if (result.LocationConstraint === '') result.LocationConstraint = 'us-east-1';
        if (result.LocationConstraint === 'EU') result.LocationConstraint = 'eu-west-1';
        if (result.LocationConstraint !== this.provider.getRegion()) {
          throw new this.serverless.classes.Error(
            'Deployment bucket is not in the same region as the lambda function'
          );
        }
        return BbPromise.resolve();
      })
      .catch(err => {
        if (err.message.indexOf('does not exist') > -1) { // create deployment bucket
          const params = {
            Bucket: bucketName,
            CreateBucketConfiguration: {
              LocationConstraint: this.provider.getRegion(),
            },
          };

          this.serverless.cli.log(`Create deployment bucket ${bucketName}`);

          return this.provider.request('S3',
            'createBucket', params
          ).then(() => BbPromise.resolve()
          ).catch(error => {
            throw new this.serverless.classes.Error(
              `Can not create deployment bucket. Error: ${error.message}`
            );
          });
        }

        throw new this.serverless.classes.Error(
          `Could not locate deployment bucket. Error: ${err.message}`
        );
      });
  },
};
