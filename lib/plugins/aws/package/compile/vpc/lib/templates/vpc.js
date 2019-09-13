'use strict';

const { SUBNET_CONFIG } = require('../utils/constants');

function getVpcTemplate(cidrBlock = SUBNET_CONFIG.VPC_CIDR) {
  return {
    Type: 'Aws::EC2::VPC',
    Properties: {
      CidrBlock: cidrBlock,
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
