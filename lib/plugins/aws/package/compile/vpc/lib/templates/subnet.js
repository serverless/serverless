'use strict';

const { SUBNET_CONFIG } = require('../utils/constants');

function getSubnetTemplate(type, vpcName, az, CidrBlock) {
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
        Ref: vpcName,
      },
      CidrBlock,
      AvailabilityZone: az,
      MapPublicIpOnLaunch: false,
      Tags: [
        { Key: 'Service', Value: { Ref: 'AWS::StackName' } },
        { Key: 'Network', Value: subnetType },
        { Key: 'Name', Value: `${subnetType} Subnet` },
      ],
    },
  };
}

module.exports = getSubnetTemplate;
