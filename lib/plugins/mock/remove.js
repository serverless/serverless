'use strict';

const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');

class Remove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('mock');

    this.hooks = {
      'remove:remove': () => BbPromise.bind(this)
        .then(this.remove),
    };
  }

  remove() {
    this.serverless.cli.log(`Removing service "${this.serverless.service.service}"`);
    const serverlessDirPath = path.join(this.serverless.config.servicePath, '.serverless');
    try {
      fse.removeSync(serverlessDirPath);
    } catch (error) {
      // fail silently
    }
  }
}

module.exports = Remove;
