'use strict';

const BbPromise = require('bluebird');
const { SUBNET_TYPES } = require('./utils/constants');
const { getSubnetLogicalIds } = require('./utils/functions');
const getSubnetRouteTableAssociationTemplate = require('./templates/subnetRouteTableAssociation');

function compileSubnetRouteTableAssociations() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const publicSubnetLogicalIds = getSubnetLogicalIds.call(this, SUBNET_TYPES.PUBLIC);
  const privateSubnetLogicalIds = getSubnetLogicalIds.call(this, SUBNET_TYPES.PRIVATE);

  if (publicSubnetLogicalIds.length) {
    const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId(SUBNET_TYPES.PUBLIC);
    const associations = publicSubnetLogicalIds.map(subnetLogicalId => {
      const logicalId = this.provider.naming.getSubnetRouteTableAssociationLogicalId(
        subnetLogicalId
      );
      return {
        [logicalId]: getSubnetRouteTableAssociationTemplate(subnetLogicalId, routeTableLogicalId),
      };
    });
    Object.assign(Resources, ...associations);
  }

  if (privateSubnetLogicalIds.length) {
    const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId(SUBNET_TYPES.PRIVATE);
    const associations = privateSubnetLogicalIds.map(subnetLogicalId => {
      const logicalId = this.provider.naming.getSubnetRouteTableAssociationLogicalId(
        subnetLogicalId
      );
      return {
        [logicalId]: getSubnetRouteTableAssociationTemplate(subnetLogicalId, routeTableLogicalId),
      };
    });
    Object.assign(Resources, ...associations);
  }

  return BbPromise.resolve();
}

module.exports = {
  compileSubnetRouteTableAssociations,
};
