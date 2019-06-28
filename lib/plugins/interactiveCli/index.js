'use strict';

const _ = require('lodash');
const initializeService = require('./initializeService');
const setupAws = require('./setupAws');

module.exports = class InteractiveCli {
  constructor(serverless) {
    if (!process.stdin.isTTY) return;

    const { processedInput } = serverless;
    if (!_.isEmpty(processedInput.commands)) return;
    if (!_.isEmpty(processedInput.options)) return;

    // Enforce interactive CLI
    processedInput.commands.push('interactiveCli');
    this.commands = {
      interactiveCli: {
        lifecycleEvents: ['initializeService', 'setupAws'],
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
