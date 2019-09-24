'use strict';

function getSubnetTemplate(vpcLogicalId, az, CidrBlock) {
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
            'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, 'subnet']],
          },
        },
      ],
    },
  };
}

module.exports = getSubnetTemplate;
