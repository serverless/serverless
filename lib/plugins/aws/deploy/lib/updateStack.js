'use strict';

const BbPromise = require('bluebird');
const async = require('async');

module.exports = {
  update() {
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

                this.serverless.cli.log('Checking stack update progress...');

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  return reject(new this.serverless.classes
                    .Error(`An error occurred while provisioning your cloudformation: ${stackData
                    .Stacks[0].StackStatusReason}`));
                }
                return callback();
              });
          }, frequency || 5000);
        },
        () => resolve(stackData.Stacks[0]));
    });
  },

  logResources(stackData) {
    var restApiId = undefined;
    const params = { StackName: stackData.StackName };

    // Request all resources for this stack
    this.sdk.request('CloudFormation',
      'listStackResources',
      params,
      this.options.stage,
      this.options.region)

    // Request data on API Gateway resources
    .then((data,err) => {
      if (err) this.serverless.cli.log(err, err.stack);
      else {
        var resources = {};
        data.StackResourceSummaries.map((resource) => resources[resource.LogicalResourceId] = resource);
        restApiId = resources['RestApiApigEvent'].PhysicalResourceId;
        return this.sdk.request('APIGateway',
            'getResources',
            {restApiId: restApiId},
            this.options.stage,
            this.options.region);
      }
    })

    // Display this data
    .then((data, err) => {
      if (err) this.serverless.cli.log(err, err.stack);
      else {
        var message = `------------------
        service: ${this.serverless.service.service}
        stage: ${this.options.stage}
        region: ${this.options.region}
        endpoints:`;
        data.items.map(item => {
          if (item.path !== '/') {
            Object.keys(item.resourceMethods).map((httpMethod) =>
                message += '\n\t\t' + buildEndpointUrl(restApiId,
                  this.options.region,
                  this.options.stage,
                  httpMethod,
                  item.path));
          }
        });

        this.serverless.cli.log(message);
      }
    });
  },

  updateStack() {
    return BbPromise.bind(this)
      .then(this.update)
      .then(this.monitorUpdate)
      .then(this.logResources);
  },
};

function buildEndpointUrl(restApiId, region, stage, httpMethod, path) {
  return `${httpMethod} - https://${restApiId}.execute-api.${region}.amazonaws.com/${stage}${path}`;
}
