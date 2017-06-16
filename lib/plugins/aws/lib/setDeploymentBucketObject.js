'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  setDeploymentBucketObject() {
    const provider = this.serverless.service.provider;

    if (provider.deploymentBucket) {
      if (_.isObject(provider.deploymentBucket)) {
        // store the object in a new variable so that it can be reused later on
        provider.deploymentBucketObject = provider.deploymentBucket;
        if (provider.deploymentBucket.name) {
          // (re)set the value of the deploymentBucket property to the name (which is a string)
          provider.deploymentBucket = provider.deploymentBucket.name;
        } else {
          provider.deploymentBucket = null;
        }
      }
    }

    return BbPromise.resolve();
  },
};
