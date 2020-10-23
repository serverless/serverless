'use strict';

const chalk = require('chalk');
const configUtils = require('@serverless/utils/config');
const isNpmPackageWritable = require('../../utils/npmPackage/isWritable');
const isNpmGlobalPackage = require('../../utils/npmPackage/isGlobal');
const { confirm } = require('./utils');

module.exports = {
  async check(serverless) {
    if (serverless.isLocallyInstalled) return false;
    if (!serverless.isStandaloneExecutable) {
      if (!(await isNpmGlobalPackage())) return false;
      if (!(await isNpmPackageWritable(serverless))) return false;
    }
    const autoUpdateConfig = configUtils.get('autoUpdate');
    if (!autoUpdateConfig) return true;
    if (autoUpdateConfig.enabled) return false;
    return !autoUpdateConfig.isInteractiveSetupPromptDisabled;
  },
  async run() {
    const isConfirmed = await confirm('Would you like the Framework to update automatically?', {
      name: 'shouldSetupAutoUpdate',
    });
    if (!isConfirmed) {
      configUtils.set('autoUpdate.isInteractiveSetupPromptDisabled', true);
      return;
    }
    configUtils.set('autoUpdate.enabled', true);

    process.stdout.write(
      `\n${chalk.green(
        'Auto updates were succesfully turned on.\n' +
          'You may turn off at any time with "serverless config --no-autoupdate"'
      )}\n`
    );
  },
};
