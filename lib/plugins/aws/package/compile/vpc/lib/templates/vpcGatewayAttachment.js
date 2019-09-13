'use strict';

function getVpcGatewayAttachmentTemplate(vpcName, internetGatewayName) {
  return {
    Type: 'AWS::EC2::VPCGatewayAttachment',
    Properties: {
      VpcId: {
        Ref: vpcName,
      },
      InternetGatewayId: {
        Ref: internetGatewayName,
      },
    },
  };
}

module.exports = getVpcGatewayAttachmentTemplate;
