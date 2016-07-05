'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const debug = require('debug')('APIG Deployment');

module.exports = {
  compileDeployment() {
    debug('Compiling APIG Deployment');

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
