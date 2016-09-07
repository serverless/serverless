'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {

    const stageTemplate = `
      {
        "Type" : "AWS::ApiGateway::Stage",
        "Properties" : {
          "RestApiId" : { "Ref": "ApiGatewayRestApi" },
          "StageName" : "${this.options.stage}",
          "DeploymentId" : { "Ref": "ApiGatewayDeployment" },
          "Variables": ${JSON.stringify(this.serverless.service.provider.variables)}
        }
      }
    `;

    this.apiGateWayStageLogicalId = `ApiGatewayStage`;
    const stageTemplateJson = JSON.parse(stageTemplate);
    const newStageObject = {
      [this.apiGateWayStageLogicalId]: stageTemplateJson,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newStageObject);

    return BbPromise.resolve();
  },
};
