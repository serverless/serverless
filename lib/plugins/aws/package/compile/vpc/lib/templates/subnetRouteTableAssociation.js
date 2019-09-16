'use strict';

function getSubnetRouteTableAssociationTemplate(subnetName, routeTableName) {
  return {
    Type: 'AWS::EC2::SubnetRouteTableAssociation',
    Properties: {
      SubnetId: {
        Ref: subnetName,
      },
      RouteTableId: {
        Ref: routeTableName,
      },
    },
  };
}

module.exports = getSubnetRouteTableAssociationTemplate;
