'use strict';

const merge = require('lodash').merge;
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    this.serverless.service.getAllFunctions().forEach(() => {
      const stageTemplate = `
        {
          "Type" : "AWS::ApiGateway::Stage",
          "Properties" : {
            "DeploymentId": { "Ref": "DeploymentApigEvent" },
            "RestApiId" : { "Ref": "RestApiApigEvent" },
            "StageName" : "${this.options.stage}"
          }
        }
      `;

      const newStageObject = {
        StageApigEvent: JSON.parse(stageTemplate),
      };

      merge(this.serverless.service.resources.aws.Resources, newStageObject);
    });

    return BbPromise.resolve();
  },
};
