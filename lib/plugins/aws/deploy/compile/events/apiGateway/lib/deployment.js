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

    const newDeploymentObject = {
      DeploymentApigEvent: JSON.parse(deploymentTemplate),
    };

    _.merge(this.serverless.service.resources.Resources, newDeploymentObject);

    return BbPromise.resolve();
  },
};
