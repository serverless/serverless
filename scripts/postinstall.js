const BbPromise = require('bluebird');
const Serverless = require('../lib/Serverless');

const serverless = new Serverless();

(() => {
  serverless.init().then(() => {
    serverless.utils.logStat(serverless, 'install').catch(() => BbPromise.resolve());
  });
})();
