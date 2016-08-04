'use strict';

const merge = require('lodash').merge;
const forEach = require('lodash').forEach;
const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  initializeResources() {
    const coreCFTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'lib',
        'core-cf.json')
    );

    // set the necessary variables before creating stack
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

    // add custom iam role statements
    if (this.serverless.service.provider.iamRoleStatements &&
      this.serverless.service.provider.iamRoleStatements instanceof Array) {
      coreCFTemplate
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyDocument
        .Statement = coreCFTemplate
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyDocument
        .Statement.concat(this.serverless.service.provider.iamRoleStatements);
    }

    // check if the user has added some "custom Resources" (and merge them into coreCFTemplate)
    if (this.serverless.service.resources && this.serverless.service.resources.Resources) {
      forEach(this.serverless.service.resources.Resources, (value, key) => {
        const newResourceObject = {
          [key]: value,
        };

        merge(coreCFTemplate.Resources, newResourceObject);
      });
    }

    this.serverless.service.resources = coreCFTemplate;

    return BbPromise.resolve();
  },
};
