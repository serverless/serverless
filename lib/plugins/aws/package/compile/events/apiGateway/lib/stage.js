'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    this.apiGatewayStageLogicalId = this.provider.naming.getStageLogicalId();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayStageLogicalId]: {
        Type: 'AWS::ApiGateway::Stage',
        Properties: {
          DeploymentId: {
            Ref: this.apiGatewayDeploymentLogicalId,
          },
          RestApiId: {
            Ref: this.apiGatewayRestApiLogicalId,
          },
          StageName: this.options.stage,
        },
      },
    });

    return BbPromise.resolve();
  },
};
