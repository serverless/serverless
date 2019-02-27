'use strict';

/* eslint-disable no-console */
/* eslint-disable no-use-before-define */

const Serverless = require('../lib/Serverless');

try {
  const serverless = new Serverless();

  (() => serverless.init()
    .then(() => serverless.utils.logStat(serverless, 'install'))
    .catch(() => Promise.resolve())
  )();
} catch (error) {
  // fail silently
}

