'use strict';

const BbPromise = require('bluebird');
const async = require('async');

module.exports = {
  create() {
    this.serverless.cli.log('Creating Stack...');

    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    const params = {
      StackName: stackName,
      OnFailure: 'DELETE',
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(this.serverless.service.resources),
      Tags: [{
        Key: 'STAGE',
        Value: this.options.stage,
      }],
    };

    return this.sdk.request('CloudFormation',
      'createStack',
      params,
      this.options.stage,
      this.options.region);
  },

  monitorCreate(cfData, frequency) {
    const validStatuses = [
      'CREATE_COMPLETE',
      'CREATE_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackData = null;

      this.serverless.cli.log('Checking stack creation progress...');

      async.whilst(
        () => (stackStatus !== 'CREATE_COMPLETE'),
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

  postCreate() {
    this.serverless.cli.log('Stack successfully created.');
    return BbPromise.resolve();
  },

  createStack() {
    if (this.options.dryRun) {
      return BbPromise.resolve();
    }

    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    return this.sdk.request('CloudFormation',
      'describeStackResources',
      { StackName: stackName },
      this.options.stage,
      this.options.region)
      .then(() => BbPromise.resolve())
      .catch(e => {
        if (e.message.indexOf('does not exist') > -1) {
          return BbPromise.bind(this)
            .then(this.create)
            .then(this.monitorCreate)
            .then(this.postCreate);
        }

        throw new this.serverless.classes.Error(e);
      });
  },
};
