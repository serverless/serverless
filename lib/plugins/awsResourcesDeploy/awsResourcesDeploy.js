'use strict';

const BbPromise = require('bluebird');
const AWS = require('aws-sdk');
const _ = require('lodash');
const path = require('path');
const async = require('async');

class awsResourcesDeploy {
  constructor(serverless) {
    this.serverless = serverless;
    this.options = {};
    this.commands = {
      resources: {
        usage: 'deploys aws resources',
        lifecycleEvents: [
          'resources',
        ],
      },
    };


    this.hooks = {
      'resources:resources': (options) => {
        this.options = options;
        return BbPromise.bind(this)
          .then(this.validate)
          .then(this.createOrUpdate)
          .then(this.monitor)
          .then(this.addOutputVariables)
          .then(this.finish)
          .catch((e) => {
            this.serverless.cli.spinner().stop();
            throw new this.serverless.classes.Error(e);
          });
      },
    };
  }

  validate() {
    if (this.serverless.config.interactive && !this.options.noGreeting) {
      this.serverless.cli.asciiGreeting();
    }

    if (!this.options.cfTemplate) {
      throw new this.serverless.classes.Error('Please provide a cf template.');
    }

    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please provide a stage name.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please provide a region name.');
    }

    // validate stage/region
    this.serverless.service.getStage(this.options.stage);
    this.serverless.service.getRegionInStage(this.options.stage, this.options.region);

    const config = {
      region: 'us-east-1',
    };
    this.CloudFormation = new AWS.CloudFormation(config);
    BbPromise.promisifyAll(this.CloudFormation, { suffix: 'Promised' });


    console.log('');
    this.serverless.cli.log('Deploying Resources to AWS...');
    this.serverless.cli.spinner().start();

    return BbPromise.resolve();
  }

  createOrUpdate() {
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const params = {
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(this.options.cfTemplate),
    };
    return this.CloudFormation.describeStackResourcesPromised({ StackName: stackName })
      .then(() => {
        // update if stack does exist
        params.StackName = stackName;
        return this.CloudFormation.updateStackPromise(params);
      })
      .catch((e) => {
        if (e.message === 'No updates are to be performed.') {
          return 'No resource updates are to be performed.';
        }

        // create if stack doesn't exist
        if (e.message.indexOf('does not exist') > -1) {
          const resourcesStackTags = [{
            Key: 'STAGE',
            Value: this.options.stage,
          }];

          if (this.serverless.service.custom.resourcesStackTags) {
            _.forEach(this.serverless.service.custom.resourcesStackTags, (value, key) => {
              resourcesStackTags.push({
                Key: key,
                Value: value,
              });
            });
          }

          params.Tags = resourcesStackTags;
          params.StackName = stackName;
          params.OnFailure = 'DELETE';
          return this.CloudFormation.createStackPromised(params);
        }

        // Otherwise throw another error
        throw new this.serverless.classes.Error(e.message);
      });
  }

  monitor(cfData) {
    // If string (no updates to be performed), log output and return
    if (typeof cfData === 'string') {
      this.serverless.cli.spinner().stop(true);
      this.serverless.cli.log(cfData);
      return BbPromise.resolve();
    }

    const validStatuses = [
      'CREATE_COMPLETE',
      'CREATE_IN_PROGRESS',
      'UPDATE_COMPLETE',
      'UPDATE_IN_PROGRESS',
      'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackData = null;

      async.whilst(() => (stackStatus !== 'UPDATE_COMPLETE' && stackStatus !== 'CREATE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.CloudFormation.describeStacksPromised(params)
              .then((data) => {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  return reject(new this.serverless.classes
                    .Error(`An error occurred while provisioning your cloudformation: ${stackData
                    .Stacks[0].StackStatusReason}`));
                }
                return callback();
              });
          }, 5000);
        }, () => resolve(stackData.Stacks[0]));
    });
  }

  addOutputVariables(cfData) {
    const serverlessEnvYamlPath = path
      .join(this.serverless.config.servicePath, 'serverless.env.yaml');
    const serverlessEnvYaml = this.serverless.yamlParser.parse(serverlessEnvYamlPath);
    cfData.Outputs.forEach((output) => {
      const varName = _.lowerFirst(output.OutputKey);
      serverlessEnvYaml.stages[this.options.stage]
        .regions[this.options.region].vars[varName] = output.OutputValue;
    });

    this.serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);
  }

  finish() {
    this.serverless.cli.spinner().stop();
    this.serverless.cli.log('Successfully deployed resources to AWS in the specified stage/region');
    return BbPromise.resolve();
  }
}

module.exports = awsResourcesDeploy;
