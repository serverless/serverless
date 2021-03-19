'use strict';

const inquirer = require('@serverless/utils/inquirer');
const cliCommandsSchema = require('../../cli/commands-schema');
const initializeService = require('./initializeService');
const setupAws = require('./setupAws');
const tabCompletion = require('./tabCompletion');
const autoUpdate = require('./autoUpdate');

module.exports = class InteractiveCli {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      interactiveCli: {
        ...cliCommandsSchema.get(''),
        isHidden: true,
        lifecycleEvents: ['initializeService', 'setupAws', 'autoUpdate', 'tabCompletion', 'end'],
      },
    };

    this.hooks = {
      'interactiveCli:initializeService': () => {
        if (!initializeService.check(serverless)) return null;
        process.stdout.write('\n');
        return initializeService.run(serverless);
      },
      'interactiveCli:setupAws': () => {
        return setupAws.check(serverless).then((isApplicable) => {
          if (!isApplicable) return null;
          process.stdout.write('\n');
          return setupAws.run(serverless);
        });
      },
      'interactiveCli:autoUpdate': async () => {
        if (!(await autoUpdate.check(serverless))) return;
        process.stdout.write('\n');
        await autoUpdate.run(serverless);
      },
      'interactiveCli:tabCompletion': () => {
        return tabCompletion.check(serverless).then((isApplicable) => {
          if (!isApplicable) return null;
          process.stdout.write('\n');
          return tabCompletion.run(serverless);
        });
      },
    };
  }
  asyncInit() {
    /*
     * The majority of setup is done here to allow other plugins to modify
     * this.commands.interactiveCli.options before deciding if the CLI
     * is in interactive mode or not.
     */

    if (!process.stdin.isTTY) return;

    const { processedInput } = this.serverless;
    if (processedInput.commands.length) return;
    const usedOptions = new Set(Object.keys(processedInput.options));
    const supportedOptions = new Set(Object.keys(this.commands.interactiveCli.options));
    // --help-interactive should trigger help which is not handled from scope of this command
    supportedOptions.delete('help-interactive');

    for (const opt of supportedOptions) usedOptions.delete(opt);

    if (usedOptions.size) return;

    // Enforce interactive CLI
    processedInput.commands.push('interactiveCli');

    // Expose customized inquirer, and setupAws configuration for other plugins
    // setupAws is further customized by dashboard plugin
    this.serverless.interactiveCli = {
      inquirer,
      awsSetupConfiguration: setupAws,
      initializeServiceConfiguration: initializeService,
    };
  }
};
