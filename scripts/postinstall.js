'use strict';

const execSync = require('child_process').execSync;

const Serverless = require('../lib/Serverless');

const serverless = new Serverless();

(() => {
  serverless.init().then(() => {
    try {
      execSync('./node_modules/tabtab/bin/tabtab install --name serverless --auto')
    } catch (e) {
      console.log('Could not auto-install serverless autocompletion script');
    }
    serverless.utils.logStat(serverless, 'install').catch(() => Promise.resolve());
  });
})();
