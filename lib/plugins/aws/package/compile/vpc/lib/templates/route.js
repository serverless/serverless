'use strict';

const { INTERNET_CIDR } = require('../utils/constants');

function getRouteTemplate(
  type,
  routeTableLogicalId,
  gatewayLogicalId,
  DependsOn,
  DestionationCidrBlock = INTERNET_CIDR
) {
  const template = {
    Type: 'AWS::EC2::Route',
    Properties: {
      DestionationCidrBlock,
      RouteTableId: { Ref: routeTableLogicalId },
    },
    DependsOn: DependsOn || undefined,
  };

  if (type.toLowerCase() === 'internet') {
    template.Properties.GatewayId = {
      Ref: gatewayLogicalId,
    };
    return template;
  }
  template.Properties.NatGatewayId = {
    Ref: gatewayLogicalId,
  };
  return template;
}

module.exports = getRouteTemplate;
