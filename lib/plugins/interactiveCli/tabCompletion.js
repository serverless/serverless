'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const chalk = require('chalk');
const BbPromise = require('bluebird');
const requireUncached = require('ncjsm/require-uncached');
const resolve = require('ncjsm/resolve/sync');
const configUtils = require('../../utils/config');
const muteConsoleLog = require('../../utils/log/muteConsoleLog');
const isTabTabCompletionSupported = require('../../utils/tabCompletion/isSupported');
const tabtabOptions = require('../../utils/tabCompletion/tabtabOptions');
const promptDisabledConfigPropertyName = require('../../utils/tabCompletion/promptDisabledConfigPropertyName');
const inquirer = require('./inquirer');
const { confirm } = require('./utils');

BbPromise.promisifyAll(fs);

module.exports = {
  check() {
    return BbPromise.try(() => {
      if (!isTabTabCompletionSupported) return false;

      const shellExtension = require('tabtab/lib/utils/systemShell')();
      return fs
        .statAsync(path.resolve(os.homedir(), `.config/tabtab/serverless.${shellExtension}`))
        .then(
          () => false,
          error => {
            if (error.code !== 'ENOENT') throw error;
            return !configUtils.get(promptDisabledConfigPropertyName);
          }
        );
    });
  },
  run() {
    return BbPromise.try(() => {
      return confirm('Would you like to setup a command line <tab> completion?', {
        name: 'shouldSetupTabCompletion',
      }).then(isConfirmed => {
        if (!isConfirmed) {
          configUtils.set(promptDisabledConfigPropertyName, true);
          return null;
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
        return prompt().then(({ location }) =>
          muteConsoleLog(() =>
            tabtabOptions.reduce(
              (previousOperation, options) =>
                previousOperation.then(() => install(Object.assign({ location }, options))),
              BbPromise.resolve()
            )
          ).then(() =>
            process.stdout.write(
              `\n${chalk.green(
                `Command line <tab> completion was successfully setup. ${chalk.bold(
                  'Make sure to reload your SHELL'
                )}.\n` +
                  'You may uninstall it by running: serverless config tabcompletion uninstall'
              )}\n`
            )
          )
        );
      });
    });
  },
};
