'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const execSync = require('child_process').execSync;

module.exports = {
  runPackage() {
    const serverlessExec = path.join(this.serverless.config
      .serverlessPath, '..', 'bin', 'serverless');

    if (!this.options.package) {
      execSync(`${serverlessExec} package`, { stdio: 'inherit' });
    }

    return BbPromise.resolve();
  },
};
