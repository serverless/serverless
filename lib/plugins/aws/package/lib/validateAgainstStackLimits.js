'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validateAgainstStackLimits() {
    const isStackSplittingUsed = this.serverless.service.provider.useStackSplitting;

    if (!isStackSplittingUsed) {
      // validate against http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-limits.html
      const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
      const resources = cfTemplate.Resources;
      const resourceCount = Object.keys(resources).length;
      const maxResourceCount = 200;
      const outputs = cfTemplate.Outputs;
      const outputCount = Object.keys(outputs).length;
      const maxOutputCount = 60;
      const serviceName = this.serverless.service.service;

      if (resourceCount >= maxResourceCount) {
        const errorMessage = [
          `The CloudFormation template of your service "${serviceName}"`,
          ` currently uses "${resourceCount}" Resources.`,
          ` The current Resource count limit is "${maxResourceCount}" according to AWS.`,
          ' You can mitigate this problem by splitting up your stack into multiple stacks.',
          ' Serverless can automate this process for you with the help of the "useStackSplitting"',
          ' config (CAUTION: this is a one-way route since nested stacks are used in this case).',
          ' However you can also use cross service communication to do this manually.',
          ' Please check the docs for more info.',
        ].join('');
        return BbPromise.reject(errorMessage);
      }

      if (outputCount >= maxOutputCount) {
        const errorMessage = [
          `The CloudFormation template of your service "${serviceName}"`,
          ` currently uses "${outputCount}" Outputs.`,
          ` The current Output count limit is "${maxOutputCount}" according to AWS.`,
          ' You can mitigate this problem by splitting up your stack into multiple stacks.',
          ' Serverless can automate this process for you with the help of the "useStackSplitting"',
          ' config (CAUTION: this is a one-way route since nested stacks are used in this case).',
          ' However you can also use cross service communication to do this manually.',
          ' Please check the docs for more info.',
        ].join('');
        return BbPromise.reject(errorMessage);
      }
    }

    return BbPromise.resolve();
  },
};
