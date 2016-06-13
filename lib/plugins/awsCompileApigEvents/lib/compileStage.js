'use strict';

const merge = require('lodash').merge;
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    if (!this.serverless.service.resources.aws.Resources) {
      throw new this.serverless.Error(
        'This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);

      // checking all three levels in the obj tree
      // to avoid "can't read property of undefined" error
      if (functionObject.events && functionObject.events.aws
        && functionObject.events.aws.http_endpoint) {
        const stageTemplate = `
          {
            "Type" : "AWS::ApiGateway::Stage",
            "Properties" : {
              "DeploymentId": { "Ref": "${functionName}DeploymentApigEvent" },
              "RestApiId" : { "Ref": "${functionName}RestApiApigEvent" },
              "StageName" : "${this.options.stage}"
            }
          }
        `;

        const newStageObject = {
          [`${functionName}StageApigEvent`]: JSON.parse(stageTemplate),
        };

        merge(this.serverless.service.resources.aws.Resources, newStageObject);
      }
    });

    return BbPromise.resolve();
  },
};
