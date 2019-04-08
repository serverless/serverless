'use strict';

const path = require('path');
const BbPromise = require('bluebird');

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'after:deploy:deploy': () => BbPromise.bind(this)
        .then(this.saveRemoveState),
    };
  }

  saveRemoveState() {
    const tenant = this.serverless.service.tenant;
    const app = this.serverless.service.app;
    const service = this.serverless.service.service;
    const outputs = this.serverless.service.outputs || {};
    const keys = Object.keys(outputs);
    if (keys.length) {
      this.serverless.cli.log(`Uploading "${this.serverless.service.service}" outputs...`);
      keys.forEach(key => {
        const output = outputs[key];
        this.serverless.cli.log(`   ${key}: ${output}`);
      });
    }
    // TODO: refactor since this is very app structure specific
    const dest = path.join(
      process.cwd(),
      '..',
      '.serverless',
      `${tenant}.${app}.${service}.outputs.json`
    );
    this.serverless.utils.writeFileSync(dest, outputs);
  }
}

module.exports = Deploy;
