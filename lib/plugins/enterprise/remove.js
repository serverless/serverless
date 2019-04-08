'use strict';

const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');

class Remove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'after:remove:remove': () => BbPromise.bind(this)
        .then(this.removeState),
    };
  }

  removeState() {
    const tenant = this.serverless.service.tenant;
    const app = this.serverless.service.app;
    const service = this.serverless.service.service;
    const dest = path.join(
      process.cwd(),
      '..',
      '.serverless',
      `${tenant}.${app}.${service}.outputs.json`
    );
    try {
      fse.removeSync(dest);
    } catch (error) {
      // do nothing...
    }
  }
}

module.exports = Remove;
