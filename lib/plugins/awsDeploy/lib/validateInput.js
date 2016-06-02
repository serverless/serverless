'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');

module.exports = {
  validateInput() {
    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please provide a stage name');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please provide a region name');
    }

    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    // validate stage/region exists in service
    const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);
    this.serverless.service.getStage(this.options.stage);
    this.serverless.service.getRegionInStage(this.options.stage, convertedRegion);

    if (!this.serverless.service.environment
        .stages[this.options.stage].regions[convertedRegion].vars) {
      throw new this.serverless.classes
        .Error('region vars object does not exist in serverless.env.yaml');
    }

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (!functionObj.handler) {
        throw new this.serverless.classes
          .Error(`Function ${functionName} does not have a handler property in serverless.yaml`);
      }
    });

    const coreCFTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath, 'templates', 'core-cf.json')
    );

    // set the necessary variables before creating stack
    coreCFTemplate
      .Resources
      .coreBucket
      .Properties
      .BucketName =
      `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;
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

    return BbPromise.resolve();
  },
};
