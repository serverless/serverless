'use strict';

const BbPromise = require('bluebird');
const { getSubnetLogicalIds } = require('./utils/functions');
const { SUBNET_TYPES } = require('./utils/constants');

function getOutputsObject(logicalId) {
  return {
    Value: { Ref: logicalId },
    Export: { Name: { 'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, logicalId]] } },
  };
}

function compileCloudFormationOutputs() {
  const { Outputs } = this.serverless.service.provider.compiledCloudFormationTemplate;

  const vpcLogicalId = this.provider.naming.getVpcLogicalId();
  const lambdaSecurityGroupLogicalId = this.provider.naming.getLambdaSecurityGroupLogicalId();
  const publicSubnetLogicalIds = getSubnetLogicalIds.call(this, SUBNET_TYPES.PUBLIC);
  const privateSubnetLogicalIds = getSubnetLogicalIds.call(this, SUBNET_TYPES.PRIVATE);

  // VPC
  Outputs[vpcLogicalId] = getOutputsObject(vpcLogicalId);
  // public subnets
  publicSubnetLogicalIds.forEach(logicalId => {
    Outputs[logicalId] = getOutputsObject(logicalId);
  });
  // private subnets
  privateSubnetLogicalIds.forEach(logicalId => {
    Outputs[logicalId] = getOutputsObject(logicalId);
  });
  // LambdaSecurityGroup
  Outputs[lambdaSecurityGroupLogicalId] = getOutputsObject(lambdaSecurityGroupLogicalId);

  return BbPromise.resolve();
}

module.exports = { compileCloudFormationOutputs };
