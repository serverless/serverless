'use strict';

const { SUBNET_CONFIG } = require('../utils/constants');

function getSubnetTemplate(type, vpcLogicalId, az, CidrBlock) {
  let subnetType;
  if (type.toLowerCase() === 'private') {
    subnetType = 'Private';
    if (!CidrBlock) CidrBlock = SUBNET_CONFIG.PRIVATE_CIDR;
  } else {
    subnetType = 'Public';
    if (!CidrBlock) CidrBlock = SUBNET_CONFIG.PUBLIC_CIDR;
  }

  return {
    Type: 'AWS::EC2::Subnet',
    Properties: {
      VpcId: {
        Ref: vpcLogicalId,
      },
      CidrBlock,
      AvailabilityZone: az,
      MapPublicIpOnLaunch: false,
      Tags: [
        {
          Key: 'Name',
          Value: {
            'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, subnetType, 'subnet']],
          },
        },
      ],
    },
  };
}

module.exports = getSubnetTemplate;
