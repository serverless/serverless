'use strict';

const merge = require('lodash').merge;
const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  initializeResources() {
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

        merge(this.serverless.service.resources.aws.Resources, resourceObj);
      });
    } else {
      this.serverless.service.resources.aws = coreCFTemplate;
    }

    return BbPromise.resolve();
  },
};
