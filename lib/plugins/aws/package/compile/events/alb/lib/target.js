'use strict';

module.exports = {
  getTargetId(functionName) {
    const { provisionedConcurrency } = this.serverless.service.functions[functionName];
    const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
    const lambdaArn = { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] };
    return provisionedConcurrency
      ? {
          'Fn::Join': [
            ':',
            [lambdaArn, this.provider.naming.getLambdaProvisionedConcurrencyAliasName()],
          ],
        }
      : lambdaArn;
  },
};
