'use strict';

const BbPromise = require('bluebird');
const { getSubnetLogicalIds } = require('./utils/functions');
const { SUBNET_TYPES } = require('./utils/constants');

function addOutput(outputs, logicalId) {
  return Object.assign(outputs, { [logicalId]: { Ref: logicalId } });
}

function compileSfeOutputs() {
  const outputs = this.serverless.service.outputs || {};

  const vpcLogicalId = this.provider.naming.getVpcLogicalId();
  const lambdaSecurityGroupLogicalId = this.provider.naming.getLambdaSecurityGroupLogicalId();
  const publicSubnetLogicalIds = getSubnetLogicalIds.call(this, SUBNET_TYPES.PUBLIC);
  const privateSubnetLogicalIds = getSubnetLogicalIds.call(this, SUBNET_TYPES.PRIVATE);

  // VPC
  addOutput(outputs, vpcLogicalId);
  // public subnets
  publicSubnetLogicalIds.forEach(logicalId => {
    addOutput(outputs, logicalId);
  });
  // private subnets
  privateSubnetLogicalIds.forEach(logicalId => {
    addOutput(outputs, logicalId);
  });
  // LambdaSecurityGroup
  addOutput(outputs, lambdaSecurityGroupLogicalId);

  this.serverless.service.outputs = outputs;

  return BbPromise.resolve();
}

module.exports = { compileSfeOutputs };
