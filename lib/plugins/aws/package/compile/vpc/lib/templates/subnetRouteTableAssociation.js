'use strict';

function getSubnetRouteTableAssociationTemplate(subnetLogicalId, routeTableLogicalId) {
  return {
    Type: 'AWS::EC2::SubnetRouteTableAssociation',
    Properties: {
      SubnetId: {
        Ref: subnetLogicalId,
      },
      RouteTableId: {
        Ref: routeTableLogicalId,
      },
    },
  };
}

module.exports = getSubnetRouteTableAssociationTemplate;
