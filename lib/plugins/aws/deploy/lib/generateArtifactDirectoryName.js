'use strict';

const BbPromise = require('bluebird');

module.exports = {
  generateArtifactDirectoryName() {
    const date = new Date();
    const dateString = `${date.getTime().toString()}-${date.toISOString()}`;
    this.serverless.service.package
      .artifactDirectoryName = `serverless/${this.serverless.service.service}/${dateString}`;

    return BbPromise.resolve();
  },
};
