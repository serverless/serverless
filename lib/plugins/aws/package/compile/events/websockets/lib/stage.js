'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    const websocketsStageLogicalId = this.provider.naming
      .getWebsocketsStageLogicalId();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [websocketsStageLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Stage',
        Properties: {
          ApiId: {
            Ref: this.websocketsApiLogicalId,
          },
          DeploymentId: {
            Ref: this.websocketsDeploymentLogicalId,
          },
          StageName: this.provider.getStage(),
          Description: this.serverless.service.provider
            .websocketsDescription || 'Serverless Websockets',
        },
      },
    });

    return BbPromise.resolve();
  },
};
