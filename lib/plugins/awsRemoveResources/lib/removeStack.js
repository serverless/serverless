'use strict';

const BbPromise = require('bluebird');
const async = require('async');

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');

    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    const params = {
      StackName: stackName,
    };

    return this.CloudFormation.deleteStackPromised(params);
  },

  monitorRemove(cfData, frequency) {
    const validStatuses = [
      'DELETE_COMPLETE',
      'DELETE_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackData = null;

      async.whilst(() => (stackStatus !== 'DELETE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.CloudFormation.describeStacksPromised(params)
              .then((data) => {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                this.serverless.cli.log('Checking stack removal progress...');

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

  removeStack() {
    const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);
    // check if stack is removed
    if (this.serverless.service
        .getVariables(this.options.stage, convertedRegion).iamRoleArnLambda) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.remove)
      .then(this.monitorRemove);
  },
};
