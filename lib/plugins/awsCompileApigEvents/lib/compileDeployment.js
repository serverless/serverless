'use strict';

const merge = require('lodash').merge;
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
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
        const deploymentTemplate = `
          {
            "Type" : "AWS::ApiGateway::Deployment",
            "Properties" : {
              "RestApiId" : { "Ref": "${functionName}RestApiApigEvent" },
              "StageName" : "${this.options.stage}"
            }
          }
        `;

        const newDeploymentObject = {
          [`${functionName}DeploymentApigEvent`]: JSON.parse(deploymentTemplate),
        };

        merge(this.serverless.service.resources.aws.Resources, newDeploymentObject);
      }
    });

    return BbPromise.resolve();
  },
};
