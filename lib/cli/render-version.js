'use strict';

const path = require('path');
const { version } = require('../../package');
const isStandaloneExecutable = require('../utils/is-standalone-executable');
const localServerlessPath = require('./local-serverless-path');
const { writeText } = require('@serverless/utils/log');

const serverlessPath = path.resolve(__dirname, '../..');

module.exports = async () => {
  const installationModePostfix = (() => {
    if (isStandaloneExecutable) return ' (standalone)';
    if (serverlessPath === localServerlessPath) return ' (local)';
    return '';
  })();

  const globalInstallationPostfix = (() => {
    if (EvalError.$serverlessInitInstallationVersion) {
      return ` ${EvalError.$serverlessInitInstallationVersion} (global)`;
    }
    return '';
  })();

  writeText(`Framework Core: ${version}${installationModePostfix}${globalInstallationPostfix}`);
};
