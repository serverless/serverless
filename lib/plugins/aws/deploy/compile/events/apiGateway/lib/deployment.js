'use strict';

const merge = require('lodash').merge;
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const deploymentTemplate = `
      {
        "Type" : "AWS::ApiGateway::Deployment",
        "DependsOn" : "${this.methodDep}",
        "Properties" : {
          "RestApiId" : { "Ref": "RestApiApigEvent" },
          "StageName" : "${this.options.stage}"
        }
      }
    `;

    const newDeploymentObject = {
      DeploymentApigEvent: JSON.parse(deploymentTemplate),
    };

    merge(this.serverless.service.resources.aws.Resources, newDeploymentObject);

    return BbPromise.resolve();
  },
};
