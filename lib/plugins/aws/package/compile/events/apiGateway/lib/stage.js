'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    // NOTE: right now we're only using a dedicated Stage resource if AWS X-Ray
    // tracing is enabled. We'll change this in the future so that users can
    // opt-in for other features as well
    const tracing = this.serverless.service.provider.tracing;

    if (!_.isEmpty(tracing) && tracing.apiGateway) {
      // NOTE: the DeploymentId is random, therefore we rely on prior usage here
      const deploymentId = this.apiGatewayDeploymentLogicalId;
      this.apiGatewayStageLogicalId = this.provider.naming
        .getStageLogicalId();

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [this.apiGatewayStageLogicalId]: {
          Type: 'AWS::ApiGateway::Stage',
          Properties: {
            DeploymentId: {
              Ref: deploymentId,
            },
            RestApiId: this.provider.getApiGatewayRestApiId(),
            StageName: this.provider.getStage(),
            TracingEnabled: true,
          },
        },
      });

      // we need to remove the stage name from the Deployment resource
      delete this.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[deploymentId]
        .Properties
        .StageName;
    }

    return BbPromise.resolve();
  },
};
