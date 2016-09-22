'use strict';

const BbPromise = require('bluebird');

module.exports = {
  generateArtifactDirectoryName() {
    const date = new Date();
    this.serverless.service.package
      .artifactDirectoryName = `serverless/${this.serverless.service.service}/${date.getTime().toString()}-${date.toISOString()}`;

    return BbPromise.resolve();
  },
};
