'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const path = require('path');

module.exports = {
  update() {
    const templateUrl = `https://s3.amazonaws.com/${
        this.bucketName
      }/${
        this.serverless.service.package.artifactDirectoryName
      }/compiled-cloudformation-template.json`;

    this.serverless.cli.log('Updating Stack...');
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateURL: templateUrl,
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
    // just write the template to disk if a deployment should not be performed
    if (this.options.noDeploy) {
      return BbPromise.bind(this)
        .then(this.writeUpdateTemplateToDisk())
        .then(BbPromise.resolve());
    }

    return BbPromise.bind(this)
      .then(this.update)
      .then(this.monitorUpdate);
  },

  // helper methods
  writeUpdateTemplateToDisk() {
    const cfTemplateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless', 'cloudformation-template-update-stack.json');

    this.serverless.utils.writeFileSync(cfTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },
};
