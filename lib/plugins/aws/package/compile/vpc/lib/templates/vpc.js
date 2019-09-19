'use strict';

const { SUBNET_CONFIG } = require('../utils/constants');

function getVpcTemplate(CidrBlock = SUBNET_CONFIG.VPC_CIDR) {
  return {
    Type: 'AWS::EC2::VPC',
    Properties: {
      CidrBlock,
      EnableDnsSupport: true,
      EnableDnsHostnames: true,
      InstanceTenancy: 'default',
      Tags: [
        {
          Key: 'Name',
          Value: {
            Ref: 'AWS::StackName',
          },
        },
      ],
    },
  };
}

module.exports = getVpcTemplate;
