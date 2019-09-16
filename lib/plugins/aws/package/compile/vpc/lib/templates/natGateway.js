'use strict';

function getNatGatewayTemplate(eipName, subnetName) {
  return {
    Type: 'AWS::EC2::NatGateway',
    DependsOn: eipName,
    Properties: {
      AllocationId: {
        'Fn::GetAtt': [eipName, 'AllocationId'],
      },
      SubnetId: {
        Ref: subnetName,
      },
    },
  };
}

module.exports = getNatGatewayTemplate;
