'use strict';

const BbPromise = require('bluebird');

module.exports = {
  generateArtifactDirectoryName() {
    const date = new Date();
    this.serverless.service.package
      .artifactDirectoryName = `${date.getTime().toString()}-${date.toISOString()}`;

    return BbPromise.resolve();
  },
};
