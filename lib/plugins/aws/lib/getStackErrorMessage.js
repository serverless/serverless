'use strict';

function isStageUpdateError(stackLatestError, that) {
  const logicalId = stackLatestError.LogicalResourceId;

  const deploymentLogicalId = that.provider.naming
    .generateApiGatewayDeploymentLogicalId(that.serverless.instanceId);
  const stageLogicalId = that.provider.naming.getStageLogicalId();

  if (logicalId === deploymentLogicalId) {
    return stackLatestError.ResourceStatusReason.match(/StageName/);
  }
  if (logicalId === stageLogicalId) {
    return stackLatestError.ResourceStatusReason.match(/already exists/);
  }

  return false;
}

// TODO: we should use `bind` rather than passing `this` into the function
function getStackErrorMessage(stackLatestError, that) {
  let errorMessage = 'An error occurred: ';
  errorMessage += `${stackLatestError.LogicalResourceId} - `;
  errorMessage += `${stackLatestError.ResourceStatusReason}.`;

  // custom error message for API Gateway stage deployment errors
  if (isStageUpdateError(stackLatestError, that)) {
    const msg = [
      '\n\n  ',
      'NOTE: Enabling API Gateway X-Ray Tracing for existing ',
      'deployments requires a remove and re-deploy of your API Gateway. ',
      '\n  ',
      'Please refer to our documentation for more information.',
    ].join('');
    errorMessage += msg;
  }

  return errorMessage;
}

module.exports = getStackErrorMessage;
