'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const find = require('lodash').find;

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');

    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    const params = {
      StackName: stackName,
    };

    return this.CloudFormation.deleteStackPromised(params).then(() => {
      return BbPromise.resolve(params);
    });
  },

  monitorRemove(cfData, frequency) {
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
              StackStatusFilter: ['DELETE_COMPLETE'],
            };
            return this.CloudFormation.listStacksPromised(params)
              .then((data) => {
                stackSummaries = data.StackSummaries;
                stackStatus = validStatuses[1]; // DELETE_IN_PROGRESS

                if (find(stackSummaries,
                    { StackStatus: 'DELETE_COMPLETE', StackName: cfData.StackName })) {
                  stackStatus = 'DELETE_COMPLETE';
                }

                this.serverless.cli.log('Checking stack removal progress...');

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
