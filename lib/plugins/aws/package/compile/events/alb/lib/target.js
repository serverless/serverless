'use strict';

module.exports = {
  getTargetId(functionName) {
    const { targetAlias } = this.serverless.service.functions[functionName];
    const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);

    return targetAlias
      ? { Ref: targetAlias.logicalId }
      : { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] };
  },
};
