'use strict';

function getVpcGatewayAttachmentTemplate(vpcLogicalId, internetGatewayLogicalId) {
  return {
    Type: 'AWS::EC2::VPCGatewayAttachment',
    Properties: {
      VpcId: {
        Ref: vpcLogicalId,
      },
      InternetGatewayId: {
        Ref: internetGatewayLogicalId,
      },
    },
  };
}

module.exports = getVpcGatewayAttachmentTemplate;
