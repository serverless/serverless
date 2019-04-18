'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    const provider = this.serverless.service.provider;

    // TracingEnabled
    const tracing = provider.tracing;
    const TracingEnabled = !_.isEmpty(tracing) && tracing.apiGateway;

    // Tags
    const tagsMerged = [provider.stackTags, provider.tags].reduce((lastTags, newTags) => {
      if (_.isPlainObject(newTags)) {
        return _.extend(lastTags, newTags);
      }
      return lastTags;
    }, {});
    const Tags = _.entriesIn(tagsMerged).map(pair => ({
      Key: pair[0],
      Value: pair[1],
    }));

    // NOTE: the DeploymentId is random, therefore we rely on prior usage here
    const deploymentId = this.apiGatewayDeploymentLogicalId;
    this.apiGatewayStageLogicalId = this.provider.naming
      .getStageLogicalId();

    // NOTE: right now we're only using a dedicated Stage resource
    // - if AWS X-Ray tracing is enabled
    // - if Tags are provided
    // We'll change this in the future so that users can
    // opt-in for other features as well
    if (TracingEnabled || Tags.length > 0) {
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [this.apiGatewayStageLogicalId]: {
          Type: 'AWS::ApiGateway::Stage',
          Properties: {
            DeploymentId: {
              Ref: deploymentId,
            },
            RestApiId: this.provider.getApiGatewayRestApiId(),
            StageName: this.provider.getStage(),
            TracingEnabled,
            Tags,
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
