'use strict';

const chalk = require('chalk');
const configUtils = require('@serverless/utils/config');
const isNpmPackageWritable = require('../../utils/npmPackage/isWritable');
const isNpmGlobalPackage = require('../../utils/npmPackage/isGlobal');
const isStandaloneExecutable = require('../../utils/isStandaloneExecutable');
const isLocallyInstalled = require('../../utils/is-locally-installed');
const { confirm } = require('../../cli/interactive-setup/utils');

module.exports = {
  async isApplicable() {
    if (!isStandaloneExecutable && !process.env.SLS_INTERACTIVE_SETUP_TEST) {
      if (await isLocallyInstalled()) return false;
      if (!(await isNpmGlobalPackage())) return false;
      if (!(await isNpmPackageWritable())) return false;
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
