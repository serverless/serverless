'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    this.apiGatewayStageLogicalId = this.provider.naming.getStageLogicalId();

    const tagsDict = [this.provider.stackTags, this.provider.tags].reduce((lastTags, newTags) => {
      if (_.isPlainObject(newTags)) {
        return _.extend(lastTags, newTags);
      }
      return lastTags;
    }, { STAGE: this.provider.getStage() });
    const Tags = _.entriesIn(tagsDict).map(pair => ({
      Key: pair[0],
      Value: pair[1],
    }));

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayStageLogicalId]: {
        Type: 'AWS::ApiGateway::Stage',
        Properties: {
          DeploymentId: { Ref: this.apiGatewayDeploymentLogicalId },
          RestApiId: this.provider.getApiGatewayRestApiId(),
          StageName: `${this.provider.getStage()}${(new Date()).getTime()}`,
          Tags,
        },
      },
    });

    return BbPromise.resolve();
  },
};
