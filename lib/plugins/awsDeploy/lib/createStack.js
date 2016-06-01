'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');
const async = require('async');

module.exports = {
  create() {
    this.serverless.cli.log('Creating Stack...');

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

    if (this.serverless.service.resources.aws) {
      Object.keys(coreCFTemplate.Resources).forEach(resourceName => {
        const resourceObj = {
          [resourceName]: coreCFTemplate.Resources[resourceName],
        };

        _.merge(this.serverless.service.resources.aws.Resources, resourceObj);
      });
    } else {
      this.serverless.service.resources.aws = coreCFTemplate;
    }

    return this.CloudFormation.createStackPromised(params);
  },
  monitorCreate(cfData, frequency) {
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
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                this.serverless.cli.log('Checking stack creation progress...');

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
    this.serverless.cli.log('Stack Created Successfully.');

    const serverlessEnvYamlPath = path
      .join(this.serverless.config.servicePath, 'serverless.env.yaml');
    return this.serverless.yamlParser.parse(serverlessEnvYamlPath).then(parsedServerlessEnvYaml => {
      const serverlessEnvYaml = parsedServerlessEnvYaml;
      cfData.Outputs.forEach((output) => {
        const varName = _.lowerFirst(output.OutputKey);
        const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);

        // add vars to memory
        this.serverless.service.environment.stages[this.options.stage]
          .regions[convertedRegion].vars[varName] = output.OutputValue;

        // add vars to file system
        serverlessEnvYaml.stages[this.options.stage]
          .regions[convertedRegion].vars[varName] = output.OutputValue;
      });
      this.serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);
      return BbPromise.resolve();
    });
  },
  createStack() {
    const converetdRegion = this.serverless.utils.convertRegionName(this.options.region);
    // check if stack created
    if (this.serverless.service
        .getVariables(this.options.stage, converetdRegion).iamRoleArnLambda) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.create)
      .then(this.monitorCreate)
      .then(this.addOutputVars);
  },
};
