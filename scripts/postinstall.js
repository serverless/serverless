'use strict';

const path = require('path');

/* eslint-disable no-console */
/* eslint-disable no-use-before-define */

const Serverless = require('../lib/Serverless');
const execSync = require('child_process').execSync;

try {
  const serverless = new Serverless();

  (() => serverless.init()
    .then(() => serverless.utils.logStat(serverless, 'install'))
    .catch(() => Promise.resolve())
  )();
} catch (error) {
  // fail silently
}
