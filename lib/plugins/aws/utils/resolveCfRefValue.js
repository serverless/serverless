'use strict';

const ServerlessError = require('../../../serverless-error');

function resolveCfRefValue(provider, resourceLogicalId, sdkParams = {}) {
  return provider
    .request(
      'CloudFormation',
      'listStackResources',
      Object.assign(sdkParams, { StackName: provider.naming.getStackName() })
    )
    .then((result) => {
      const targetStackResource = result.StackResourceSummaries.find(
        (stackResource) => stackResource.LogicalResourceId === resourceLogicalId
      );
      if (targetStackResource) return targetStackResource.PhysicalResourceId;
      if (result.NextToken) {
        return resolveCfRefValue(provider, resourceLogicalId, { NextToken: result.NextToken });
      }

      throw new ServerlessError(
        `Could not resolve Ref with name ${resourceLogicalId}. Are you sure this value matches one resource logical ID ?`,
        'CF_REF_RESOLUTION'
      );
    });
}

module.exports = resolveCfRefValue;
