'use strict';

class AwsRemoveResources {
  constructor(serverless) {
    this.serverless = serverless;

    Object.assign(this);

    this.hooks = {
      'remove:resources:removeResources': (options) => {
        this.options = options || {};

        console.log('Removing resources...'); // TODO: add Promise chain here
      },
    };
  }
}

module.exports = AwsRemoveResources;
