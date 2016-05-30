'use strict';
/*
 * check if stack already exists. resolve if it is.
 * get core cf template and add variables
 * create stack
 * monitor stack
 * add output vars
 *
 * TO MOCK:
 * this.options.region
 * this.options.stage
 * service name
 * serverlessEnvYaml
 */


const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');
const async = require('async');
const awsUtils = require('./utils');

module.exports = {
  createStack() {
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const coreCFTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath, 'templates', 'core-cf.json')
    );

    // set the necessary variables before creating stack
    coreCFTemplate
      .Resources
      .coreBucket
      .Properties
      .BucketName = `${this.serverless.service.service}-${this.options.region}`;
    coreCFTemplate
      .Resources
      .IamPolicyLambda
      .Properties
      .PolicyName = `${this.options.stage}-${this.serverless.service.service}-lambda`;
    coreCFTemplate
      .Resources
      .IamPolicyLambda
      .Properties
      .PolicyDocument
      .Statement[0]
      .Resource = `arn:aws:logs:${this.options.region}:*:*`;

    const params = {
      StackName: stackName,
      OnFailure: 'DELETE',
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(coreCFTemplate),
      Tags: [{
        Key: 'STAGE',
        Value: this.options.stage,
      }],
    };

    return this.CloudFormation.createStackPromised(params);
  },
  monitor(cfData, frequency) {
    const validStatuses = [
      'CREATE_COMPLETE',
      'CREATE_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackData = null;

      async.whilst(() => (stackStatus !== 'CREATE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.CloudFormation.describeStacksPromised(params)
              .then((data) => {
                console.log('check')
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

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
  addOutputVars(cfData) {
    const serverlessEnvYamlPath = path
      .join(this.serverless.config.servicePath, 'serverless.env.yaml');
    return this.serverless.yamlParser.parse(serverlessEnvYamlPath).then(parsedServerlessEnvYaml => {
      const serverlessEnvYaml = parsedServerlessEnvYaml;
      cfData.Outputs.forEach((output) => {
        const varName = _.lowerFirst(output.OutputKey);
        const convertedRegion = awsUtils.convertRegionName(this.options.region);
        serverlessEnvYaml.stages[this.options.stage]
          .regions[convertedRegion].vars[varName] = output.OutputValue; // process region name
      });
      this.serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);
      return BbPromise.resolve();
    });
  },
  deployCore() {
    // check if stack created
    if (this.serverless.service
        .getVariables(this.options.stage, this.options.region).IamRoleArnLambda) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.createStack)
      .then(this.monitor)
      .then(this.addOutputVars);
  },
};
