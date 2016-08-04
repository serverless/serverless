'use strict';

const _ = require('lodash');
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

    const deploymentLogicalId = `DeploymentApigEvent${(new Date).getTime().toString()}`;

    const newDeploymentObject = {
      [deploymentLogicalId]: JSON.parse(deploymentTemplate),
    };

    _.merge(this.serverless.service.resources.Resources, newDeploymentObject);

    return BbPromise.resolve();
  },
};
