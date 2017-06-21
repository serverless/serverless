'use strict';

/* eslint-disable no-console */
/* eslint-disable no-use-before-define */

const Serverless = require('../lib/Serverless');
const execSync = require('child_process').execSync;

try {
  const serverless = new Serverless();

  (() => serverless.init()
    .then(() => serverless.utils.logStat(serverless, 'install'))
    .then(() => setupAutocomplete())
    .catch(() => Promise.resolve())
  )();
} catch (error) {
  // fail silently
}

function setupAutocomplete() {
  return new Promise((resolve, reject) => {
    const tabtabPath = require.resolve('tabtab').replace(/\/index.js$/, '');
    try {
      execSync(`node ${tabtabPath}/src/cli.js install --name serverless --auto`);
      execSync(`node ${tabtabPath}/src/cli.js install --name sls --auto`);
      return resolve();
    } catch (error) {
      execSync(`node ${tabtabPath}/src/cli.js install --name serverless --stdout`);
      execSync(`node ${tabtabPath}/src/cli.js install --name sls --stdout`);
      console.log('Could not auto-install serverless autocomplete script.');
      console.log('Please copy / paste the script above into your shell.');
      return reject(error);
    }
  });
}
