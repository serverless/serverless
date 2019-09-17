'use strict';

const inquirer = require('./inquirer');
const initializeService = require('./initializeService');
const setupAws = require('./setupAws');
const tabCompletion = require('./tabCompletion');

module.exports = class InteractiveCli {
  constructor(serverless) {
    this.serverless = serverless;

    serverless.allowedInteractiveCliOptions = new Set();

    // Expose customized inquirer, and setupAws configuration for other plugins
    // setupAws is further customized by dashboard plugin
    this.serverless.interactiveCli = { inquirer, awsSetupConfiguration: setupAws };

    this.commands = {
      interactiveCli: {
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
    if (!process.stdin.isTTY) return Promise.resove();

    const { processedInput } = this.serverless;
    if (processedInput.commands.length) return Promise.resove();
    const options = new Set(Object.keys(processedInput.options));
    for (const opt of this.serverless.allowedInteractiveCliOptions) {
      options.delete(opt);
    }
    if (options.size) return Promise.resove();

    // Enforce interactive CLI
    processedInput.commands.push('interactiveCli');

    return Promise.resolve();
  }
};
