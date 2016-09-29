'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const deploymentTemplate = `
      {
        "Type" : "AWS::ApiGateway::Deployment",
        "Properties" : {
          "RestApiId" : { "Ref": "ApiGatewayRestApi" },
          "StageName" : "${this.options.stage}"
        }
      }
    `;

    const deploymentLogicalName = `ApiGatewayDeployment${(new Date()).getTime().toString()}`;
    const deploymentTemplateJson = JSON.parse(deploymentTemplate);
    deploymentTemplateJson.DependsOn = this.methodDependencies;

    const newDeploymentObject = {
      [deploymentLogicalName]: deploymentTemplateJson,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newDeploymentObject);

    const waitConditionHandleTemplate = `
      {
        "Type": "AWS::CloudFormation::WaitConditionHandle",
        "Properties": { }
      }
    `;

    const apiGatewayDeploymentWaitHandleLogicalName = 'ApiGatewayDeploymentWaitHandle';
    const waitConditionHandleTemplateJson = JSON.parse(waitConditionHandleTemplate);

    const newWaitHandleObject = {
      [apiGatewayDeploymentWaitHandleLogicalName]: waitConditionHandleTemplateJson,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newWaitHandleObject);

    const waitConditionTemplate = `
      {
        "Type": "AWS::CloudFormation::WaitCondition",
        "DependsOn": "${deploymentLogicalName}",
        "Properties": {
          "Count" : "0",
          "Handle" : { "Ref" : "${apiGatewayDeploymentWaitHandleLogicalName}" },
          "Timeout" : "1"
        }
      }
    `;

    const waitConditionTemplateJson = JSON.parse(waitConditionTemplate);

    const newWaitObject = {
      ApiGatewayDeploymentWait: waitConditionTemplateJson,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newWaitObject);

    // create CLF Output for endpoint
    const outputServiceEndpointTemplate = `
    {
      "Description": "URL of the service endpoint",
      "Value": { "Fn::Join" : [ "", [ "https://", { "Ref": "ApiGatewayRestApi" },
        ".execute-api.${this.options.region}.amazonaws.com/${this.options.stage}"] ] }
    }`;

    const newOutputEndpointObject = {
      ServiceEndpoint: JSON.parse(outputServiceEndpointTemplate),
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs,
      newOutputEndpointObject);

    return BbPromise.resolve();
  },
};
