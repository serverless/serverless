'use strict';

const { INTERNET_CIDR } = require('../utils/constants');

function getRouteTemplate(
  internetGatewayName,
  routeTableName,
  vpcGatewayAttachmentName,
  DestionationCidrBlock = INTERNET_CIDR
) {
  return {
    Type: 'AWS::EC2::Route',
    Properties: {
      DestionationCidrBlock,
      GatewayId: { Ref: internetGatewayName },
      RouteTableId: { Ref: routeTableName },
    },
    DependsOn: vpcGatewayAttachmentName,
  };
}

module.exports = getRouteTemplate;
