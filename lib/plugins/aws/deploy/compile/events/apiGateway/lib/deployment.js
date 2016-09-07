'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {

    this.variables = {}
    if('variables' in this.serverless.service.provider)
      this.variables = this.serverless.service.provider.variables

    const deploymentTemplate = `
      {
        "Type" : "AWS::ApiGateway::Deployment",
        "Properties" : {
          "RestApiId" : { "Ref": "ApiGatewayRestApi" },
          "StageName" : "${this.options.stage}",
          "StageDescription": {
            "StageName": "${this.options.stage}",
            "Variables": ${JSON.stringify(this.variables)}
          }
        }
      }
    `;

    this.apiGateWayDeploymentLogicalId = `ApiGatewayDeployment${(new Date()).getTime().toString()}`;
    const deploymentTemplateJson = JSON.parse(deploymentTemplate);
    deploymentTemplateJson.DependsOn = this.methodDependencies;

    const newDeploymentObject = {
      [this.apiGateWayDeploymentLogicalId]: deploymentTemplateJson,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newDeploymentObject);

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
