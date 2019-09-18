'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const { getSubnetLogicalIds } = require('./utils/functions');
const { SUBNET_TYPES } = require('./utils/constants');

function updateFunctionConfigs() {
  const privateSubnetLogicalIds = getSubnetLogicalIds.call(this, SUBNET_TYPES.PRIVATE);

  if (privateSubnetLogicalIds.length) {
    const securityGroups = [
      { 'Fn::GetAtt': [this.provider.naming.getLambdaSecurityGroupLogicalId(), 'GroupId'] },
    ];
    const privateSubnets = privateSubnetLogicalIds.map(logicalId => ({
      Ref: logicalId,
    }));

    this.serverless.service.getAllFunctions().forEach(funcName => {
      const funcObj = this.serverless.service.getFunction(funcName);

      if (funcObj.vpc) {
        // security groups
        const existingSecurityGroupIds = funcObj.vpc.securityGroupIds || [];
        const mergedSecurityGroupIds = _.union(existingSecurityGroupIds, securityGroups);
        // subnets
        const existingSubnetIds = funcObj.vpc.subnetIds || [];
        const mergedSubnetIds = _.union(existingSubnetIds, privateSubnets);
        // updating the current config
        funcObj.vpc.subnetIds = mergedSubnetIds;
        funcObj.vpc.securityGroupIds = mergedSecurityGroupIds;
      } else {
        funcObj.vpc = {
          securityGroupIds: securityGroups,
          subnetIds: privateSubnets,
        };
      }
    });
  }

  return BbPromise.resolve();
}

module.exports = { updateFunctionConfigs };
