'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const chalk = require('chalk');
const requireUncached = require('ncjsm/require-uncached');
const resolve = require('ncjsm/resolve/sync');
const configUtils = require('@serverless/utils/config');
const muteConsoleLog = require('../../utils/log/muteConsoleLog');
const isTabTabCompletionSupported = require('../../utils/tabCompletion/isSupported');
const tabtabOptions = require('../../utils/tabCompletion/tabtabOptions');
const promptDisabledConfigPropertyName = require('../../utils/tabCompletion/promptDisabledConfigPropertyName');
const inquirer = require('@serverless/utils/inquirer');
const { confirm } = require('./utils');

module.exports = {
  async isApplicable() {
    if (!isTabTabCompletionSupported) return false;

    const shellExtension = require('tabtab/lib/utils/systemShell')();
    try {
      await fs.stat(path.resolve(os.homedir(), `.config/tabtab/serverless.${shellExtension}`));
      return false;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return !configUtils.get(promptDisabledConfigPropertyName);
    }
  },
  async run() {
    if (
      !(await confirm('Would you like to setup a command line <tab> completion?', {
        name: 'shouldSetupTabCompletion',
      }))
    ) {
      configUtils.set(promptDisabledConfigPropertyName, true);
      return;
    }

    const promptPath = require.resolve('tabtab/lib/prompt');
    const tabtabsInquirerPath = resolve(path.dirname(promptPath), 'inquirer').realPath;

    // Hack tabtabs prompt to use our inquirer customization
    const prompt = requireUncached([promptPath, tabtabsInquirerPath], () => {
      require(tabtabsInquirerPath);
      require.cache[tabtabsInquirerPath].exports = inquirer;
      return require(promptPath);
    });
    const { install } = require('tabtab/lib/installer');
    const location = (await prompt()).location;
    await muteConsoleLog(async () => {
      for (const options of tabtabOptions) {
        await install(Object.assign({ location }, options));
      }
    });
    process.stdout.write(
      `\n${chalk.green(
        `Command line <tab> completion was successfully setup. ${chalk.bold(
          'Make sure to reload your SHELL'
        )}.\nYou may uninstall it by running: serverless config tabcompletion uninstall`
      )}\n`
    );
  },
};
