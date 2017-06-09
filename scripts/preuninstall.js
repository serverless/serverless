'use strict';

const Serverless = require('../lib/Serverless');

try {
  const serverless = new Serverless();

  (() => serverless.init()
    .then(() => serverless.utils.logStat(serverless, 'uninstall'))
    .catch(() => Promise.resolve())
  )();
} catch (error) {
  // fail silently
}
