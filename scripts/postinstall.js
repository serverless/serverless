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
    .then(() => setupAutocomplete())
    .catch(() => Promise.resolve())
  )();
} catch (error) {
  // fail silently
}

function setupAutocomplete() {
  return new Promise((resolve, reject) => {
    const indexRegex = new RegExp(path.join(path.sep, 'index.js'));
    const tabtabPath = require.resolve('tabtab').replace(indexRegex, '');
    const tabtabCliPath = path.join(tabtabPath, 'src', 'cli.js');

    try {
      execSync(`node "${tabtabCliPath}" install --name serverless --auto`);
      execSync(`node "${tabtabCliPath}" install --name sls --auto`);
      execSync(`node "${tabtabCliPath}" install --name slss --auto`);
      return resolve();
    } catch (error) {
      execSync(`node "${tabtabCliPath}" install --name serverless --stdout`);
      execSync(`node "${tabtabCliPath}" install --name sls --stdout`);
      execSync(`node "${tabtabCliPath}" install --name slss --stdout`);
      console.log('Could not auto-install serverless autocomplete script.');
      console.log('Please copy / paste the script above into your shell.');
      return reject(error);
    }
  });
}
