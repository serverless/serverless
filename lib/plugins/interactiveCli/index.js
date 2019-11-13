'use strict';

const inquirer = require('./inquirer');
const initializeService = require('./initializeService');
const setupAws = require('./setupAws');
const tabCompletion = require('./tabCompletion');

module.exports = class InteractiveCli {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      interactiveCli: {
        isHidden: true,
        options: {},
        lifecycleEvents: ['initializeService', 'setupAws', 'tabCompletion', 'end'],
      },
    };

    this.hooks = {
      'interactiveCli:initializeService': () => {
        if (!initializeService.check(serverless)) return null;
        process.stdout.write('\n');
        return initializeService.run(serverless);
      },
      'interactiveCli:setupAws': () => {
        return setupAws.check(serverless).then(isApplicable => {
          if (!isApplicable) return null;
          process.stdout.write('\n');
          return setupAws.run(serverless);
        });
      },
      'interactiveCli:tabCompletion': () => {
        return tabCompletion.check(serverless).then(isApplicable => {
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
    const options = new Set(Object.keys(processedInput.options));
    for (const opt of Object.keys(this.commands.interactiveCli.options)) {
      options.delete(opt);
    }
    if (options.size) return;

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
