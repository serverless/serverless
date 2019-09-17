'use strict';

function getRouteTableTemplate(vpcLogicalId) {
  return {
    Type: 'AWS::EC2::RouteTable',
    Properties: {
      VpcId: { Ref: vpcLogicalId },
    },
  };
}

module.exports = getRouteTableTemplate;
