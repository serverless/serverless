'use strict';

function getRouteTableTemplate(vpcName) {
  return {
    Type: 'AWS::EC2::RouteTable',
    Properties: {
      VpcId: { Ref: vpcName },
    },
  };
}

module.exports = getRouteTableTemplate;
