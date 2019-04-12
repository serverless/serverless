'use strict';

const BbPromise = require('bluebird');

// NOTE: the checks here are X-Ray specific. However the error messages can be updated
// to reflect the general problem which occurrs when upgrading / downgrading the
// Stage resource / Deplyment resource

module.exports = {
  checkForBreakingChanges() {
    const StackName = this.provider.naming.getStackName();
    return this.provider.request('CloudFormation',
      'getTemplate', { StackName }).then((res) => {
        if (res) {
          const oldResources = JSON.parse(res.TemplateBody).Resources;
          const newResources = this.serverless.service.provider
            .compiledCloudFormationTemplate.Resources;
          const deploymentLogicalIdRegex =
            new RegExp(this.provider.naming.generateApiGatewayDeploymentLogicalId(''));
          const oldDeploymentLogicalId = Object.keys(oldResources)
            .filter(elem => elem.match(deploymentLogicalIdRegex)).shift();
          const newDeploymentLogicalId = Object.keys(newResources)
            .filter(elem => elem.match(deploymentLogicalIdRegex)).shift();
          const stageLogicalId = this.provider.naming.getStageLogicalId();

          // 1. if the user wants to upgrade to use the new AWS::APIGateway::Stage resource but
          // the old state still uses the stage defined on the AWS::ApiGateway::Deployment resource
          if (oldResources[oldDeploymentLogicalId] && oldResources[oldDeploymentLogicalId].Properties.StageName && newResources[stageLogicalId]) { // eslint-disable-line max-len
            const msg = [
              'NOTE: Enabling API Gateway X-Ray Tracing for existing ',
              'deployments requires a remove and re-deploy of your API Gateway. ',
              '\n\n  ',
              'Please refer to our documentation for more information.',
            ].join('');
            throw new this.serverless.classes.Error(msg);
          }

          // 2. if the user wants to downgrade from a dedicated AWS::ApiGateway::Stage resource
          // to the stage being embedded in the AWS::ApiGateway::Deployment resource
          if (oldResources[stageLogicalId] && newResources[newDeploymentLogicalId] && newResources[newDeploymentLogicalId].Properties.StageName) { // eslint-disable-line
            if (!this.options.force) {
              const msg = [
                'NOTE: Disabling API Gateway X-Ray Tracing for existing ',
                'deployments might result in unexpected behavior.',
                '\n  ',
                'We recommend to remove and re-deploy your API Gateway. ',
                'Use the --force option if you want to proceed with the deployment. ',
                '\n\n  ',
                'Please refer to our documentation for more information.',
              ].join('');
              throw new this.serverless.classes.Error(msg);
            }
          }
        }
      }).catch((error) => {
        // in this case it's the first deployment so there's no template available to fetch
        if (error.providerError && error.providerError.code === 'ValidationError') {
          return BbPromise.resolve();
        }
        throw error;
      });
  },
};
