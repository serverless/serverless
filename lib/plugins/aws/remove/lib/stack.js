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

    return this.CloudFormation.deleteStackPromised(params).then(() => stackName);
  },

  monitorRemove(stackName, frequency) {
    const validStatuses = [
      'DELETE_COMPLETE',
      'DELETE_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackSummaries = null;

      async.whilst(
        () => (stackStatus !== 'DELETE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackStatusFilter: validStatuses,
            };
            return this.CloudFormation.listStacksPromised(params)
              .then((data) => {
                stackSummaries = data.StackSummaries;
                stackStatus = stackSummaries[0].StackStatus;

                this.serverless.cli.log('Checking stack removal progress...');

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  return reject(new this.serverless.classes
                    .Error('An error occurred while removing the stack'));
                }

                return callback();
              });
          }, frequency || 5000);
        },
        () => resolve(stackSummaries[0]));
    });
  },

  removeStack() {
    return BbPromise.bind(this)
      .then(this.remove)
      .then(this.monitorRemove);
  },
};
