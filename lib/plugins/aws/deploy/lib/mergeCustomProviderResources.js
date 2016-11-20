'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

function indexS3Buckets(resources) {
  const result = {};
  _.forEach(resources, (resource, logicalId) => {
    if (resource.Type === 'AWS::S3::Bucket' &&
      resource.Properties && resource.Properties.BucketName) {
      result[resource.Properties.BucketName] = { logicalId, resource };
    }
  });
  return result;
}

function mergeS3Buckets(compiledResources, customResources) {
  const customBuckets = indexS3Buckets(customResources);

  if (!_.isEmpty(customBuckets)) {
    const compiledBuckets = indexS3Buckets(compiledResources);

    _.forEach(customBuckets, (customBucket, name) => {
      const compiledBucket = compiledBuckets[name];
      if (compiledBucket) {
        // eslint-disable-next-line no-param-reassign
        compiledResources[customBucket.logicalId] =
          _.merge({}, compiledBucket.resource, customBucket.resource);
        // eslint-disable-next-line no-param-reassign
        delete compiledResources[compiledBucket.logicalId];
      }
    });
  }
}


module.exports = {
  mergeCustomProviderResources() {
    if (this.serverless.service.resources && !this.serverless.service.resources.Resources) {
      this.serverless.service.resources.Resources = {};
    }
    if (this.serverless.service.resources && !this.serverless.service.resources.Outputs) {
      this.serverless.service.resources.Outputs = {};
    }

    mergeS3Buckets(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      this.serverless.service.resources.Resources
    );

    // merge rest
    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate,
      this.serverless.service.resources
    );

    return BbPromise.resolve();
  },
};
