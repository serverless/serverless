'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const _ = require('lodash');

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');

    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    const params = {
      StackName: stackName,
    };

    return this.sdk.request('CloudFormation',
      'deleteStack',
      params,
      this.options.stage,
      this.options.region)
      .then(() => stackName);
  },

  monitorRemove(stackName, frequency) {
    const validStatuses = [
      'DELETE_COMPLETE',
      'DELETE_IN_PROGRESS',
    ];
    const stackStatusFilter = [
      'DELETE_COMPLETE',
      'DELETE_IN_PROGRESS',
      'DELETE_FAILED',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackSummaries = null;

      async.whilst(
        () => (stackStatus !== 'DELETE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackStatusFilter: stackStatusFilter,
            };
            return this.sdk.request('CloudFormation',
              'listStacks',
              params,
              this.options.stage,
              this.options.region)
              .then((data) => {
                stackSummaries = data.StackSummaries;

                let convertedStackSummary = {};
                // convert DeletionTime to UNIX timestamp
                stackSummaries.forEach((stackSummary) => {
                  convertedStackSummary = stackSummary;
                  convertedStackSummary.DeletionTime = (new Date(stackSummary.DeletionTime))
                    .getTime() / 1000;
                });

                const stack = _.find(
                  _.orderBy(stackSummaries, 'DeletionTime', 'desc'), { StackName: stackName }
                );
                stackStatus = stack.StackStatus;

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
