'use strict';

const memoizee = require('memoizee');
const naming = require('../lib/naming');

const resolveLambdaTarget = memoizee((functionName, functionObject) => {
  const lambdaLogicalId = naming.getLambdaLogicalId(functionName);
  const functionArnGetter = { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] };
  if (!functionObject.targetAlias) return functionArnGetter;
  return { 'Fn::Join': [':', [functionArnGetter, functionObject.targetAlias.name]] };
});

module.exports = resolveLambdaTarget;
