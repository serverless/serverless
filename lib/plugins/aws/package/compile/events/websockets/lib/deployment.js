'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const websocketsDeploymentLogicalId = this.provider.naming
      .getWebsocketsDeploymentLogicalId();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [websocketsDeploymentLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Deployment',
        Properties: {
          ApiId: {
            Ref: this.websocketsApiLogicalId,
          },
          StageName: this.provider.getStage(),
          Description: this.serverless.service.provider.websocketsDescription || '',
        },
      },
    });

    return BbPromise.resolve();
  },
};
