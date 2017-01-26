'use strict';

const Serverless = require('../lib/Serverless');

const serverless = new Serverless();

(() => {
  serverless.init().then(() => {
    serverless.utils.logStat(serverless, 'install').catch(() => Promise.resolve());
  });
})();
