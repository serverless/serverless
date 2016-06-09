'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const merge = require('lodash').merge;
const find = require('lodash').find;

module.exports = {
  update() {
    this.serverless.cli.log('Adding function resources to CF...');
    const serviceResources = this.serverless.service.resources.aws;

    this.serverless.service.compiledFunctionResources.forEach((functionResource) => {
      const functionName = Object.keys(functionResource)[0];

      // add the S3Key to the previously compiled function
      functionResource[functionName].Properties.Code.S3Key =
        (find(this.deployedFunctions, { name: functionName }).zipFileKey);

      merge(serviceResources.Resources, functionResource);
    });

    this.serverless.service.resources.aws = serviceResources;

    this.serverless.cli.log('Updating Stack...');
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(this.serverless.service.resources.aws),
    };

    return this.CloudFormation.updateStackPromised(params);
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

      async.whilst(() => (stackStatus !== 'UPDATE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.CloudFormation.describeStacksPromised(params)
              .then((data) => {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                this.serverless.cli.log('Checking stack update progress...');

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  return reject(new this.serverless.classes
                    .Error(`An error occurred while provisioning your cloudformation: ${stackData
                    .Stacks[0].StackStatusReason}`));
                }
                return callback();
              });
          }, frequency || 5000);
        }, () => resolve(stackData.Stacks[0]));
    });
  },

  updateStack() {
    return BbPromise.bind(this)
      .then(this.update)
      .then(this.monitorUpdate);
  },
};
