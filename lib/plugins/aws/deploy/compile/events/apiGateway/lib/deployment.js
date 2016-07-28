'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const deploymentTemplate = `
      {
        "Type" : "AWS::ApiGateway::Deployment",
        "DeletionPolicy": "Retain",
        "Properties" : {
          "RestApiId" : { "Ref": "RestApiApigEvent" },
          "StageName" : "${this.options.stage}",
          "Description" : "${this.options.stage} created at ${new Date()}"
        }
      }
    `;

    const newDeploymentObject = {};

    newDeploymentObject[`DeploymentApigEvent${new Date().getTime()}`]
      = JSON.parse(deploymentTemplate);

    _.merge(this.serverless.service.resources.Resources, newDeploymentObject);

    return BbPromise.resolve();
  },
};
