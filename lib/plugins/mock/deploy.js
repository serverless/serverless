'use strict';

const BbPromise = require('bluebird');

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('mock');

    this.hooks = {
      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.deploy),
    };
  }

  deploy() {
    this.serverless.cli.log(`Deploying service "${this.serverless.service.service}"`);
    const environment = this.serverless.service.provider.environment;
    if (environment && Object.keys(environment)) {
      this.serverless.cli.log('Using environment variables:');
      console.log(JSON.stringify(this.serverless.service.provider.environment, null, 2)); // eslint-disable-line
    }
  }
}

module.exports = Deploy;
