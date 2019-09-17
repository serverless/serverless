'use strict';

function getNatGatewayTemplate(eipLogicalId, subnetName, DependsOn) {
  return {
    Type: 'AWS::EC2::NatGateway',
    DependsOn: DependsOn || eipLogicalId,
    Properties: {
      AllocationId: {
        'Fn::GetAtt': [eipLogicalId, 'AllocationId'],
      },
      SubnetId: {
        Ref: subnetName,
      },
    },
  };
}

module.exports = getNatGatewayTemplate;
