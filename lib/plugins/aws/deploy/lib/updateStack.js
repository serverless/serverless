'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const _ = require('lodash');

module.exports = {
  update() {
    // check if the user has added some "custom provider resources"
    // and merge them into the CloudFormation template if there are any
    if (this.serverless.service.customProviderResources.Resources) {
      _.forEach(this.serverless.service.customProviderResources.Resources, (value, key) => {
        const newResourceObject = {
          [key]: value,
        };

        _.merge(this.serverless.service.resources.Resources, newResourceObject);
      });
    }

    this.serverless.cli.log('Updating Stack...');
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(this.serverless.service.resources),
    };

    return this.sdk.request('CloudFormation',
      'updateStack',
      params,
      this.options.stage,
      this.options.region);
  },

  monitorUpdate(cfData, frequency) {
    const validStatuses = [
      'UPDATE_COMPLETE',
      'UPDATE_IN_PROGRESS',
      'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackData = null;

      this.serverless.cli.log('Checking stack update progress...');

      async.whilst(
        () => (stackStatus !== 'UPDATE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.sdk.request('CloudFormation',
              'describeStacks',
              params,
              this.options.stage,
              this.options.region)
              .then((data) => {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                this.serverless.cli.printDot();

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  return reject(new this.serverless.classes
                    .Error(`An error occurred while provisioning your cloudformation: ${stackData
                    .Stacks[0].StackStatusReason}`));
                }
                return callback();
              });
          }, frequency || 5000);
        },
        () => {
          // empty console.log for a prettier output
          this.serverless.cli.consoleLog('');
          resolve(stackData.Stacks[0]);
        });
    });
  },

  updateStack() {
    return BbPromise.bind(this)
      .then(this.update)
      .then(this.monitorUpdate);
  },
};
