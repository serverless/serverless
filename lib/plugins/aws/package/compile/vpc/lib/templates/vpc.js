'use strict';

const { SUBNET_CONFIG } = require('../utils/constants');

function getVpcTemplate(CidrBlock = SUBNET_CONFIG.VPC_CIDR) {
  return {
    Type: 'Aws::EC2::VPC',
    Properties: {
      CidrBlock,
      EnableDnsSupport: true,
      EnableDnsHostNames: true,
      InstanceTenancy: 'default',
      Tags: [
        {
          Key: 'Service',
          Value: {
            Ref: 'AWS::StackName',
          },
        },
      ],
    },
  };
}

module.exports = getVpcTemplate;
