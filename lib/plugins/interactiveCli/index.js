'use strict';

const _ = require('lodash');
const inquirer = require('./inquirer');
const initializeService = require('./initializeService');
const setupAws = require('./setupAws');

module.exports = class InteractiveCli {
  constructor(serverless) {
    if (!process.stdin.isTTY) return;

    const { processedInput } = serverless;
    if (processedInput.commands.length) return;
    if (!_.isEmpty(processedInput.options)) return;

    // Expose customized inquirer, and setupAws configuration for other plugins
    // setupAws is further customized by dashboard plugin
    serverless.interactiveCli = { inquirer, awsSetupConfiguration: setupAws };

    // Enforce interactive CLI
    processedInput.commands.push('interactiveCli');
    this.commands = {
      interactiveCli: {
        lifecycleEvents: ['initializeService', 'setupAws', 'end'],
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
    };
  }
};
