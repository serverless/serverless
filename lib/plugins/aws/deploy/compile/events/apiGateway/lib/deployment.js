'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const deploymentTemplate = `
      {
        "Type" : "AWS::ApiGateway::Deployment",
        "Properties" : {
          "RestApiId" : { "Ref": "RestApiApigEvent" },
          "StageName" : "${this.options.stage}"
        }
      }
    `;

    const timestamp = (new Date).getTime().toString();
    this.serverless.service.custom.deployTime = timestamp;
    const deploymentLogicalId = `DeploymentApigEvent${timestamp}`;
    const deploymentTemplateJson = JSON.parse(deploymentTemplate);
    deploymentTemplateJson.DependsOn = this.methodDependencies;

    const newDeploymentObject = {
      [deploymentLogicalId]: deploymentTemplateJson,
    };

    _.merge(this.serverless.service.resources.Resources, newDeploymentObject);

    return BbPromise.resolve();
  },
};
