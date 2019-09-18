'use strict';

const BbPromise = require('bluebird');
const { SUBNET_TYPES } = require('./utils/constants');
const { getSubnetTypeKeys } = require('./utils/functions');
const getSubnetRouteTableAssociationTemplate = require('./templates/subnetRouteTableAssociation');

function compileSubnetRouteTableAssociations() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const publicSubnetKeys = getSubnetTypeKeys.call(this, SUBNET_TYPES.PUBLIC);
  const privateSubnetKeys = getSubnetTypeKeys.call(this, SUBNET_TYPES.PRIVATE);

  if (publicSubnetKeys.length) {
    const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId(SUBNET_TYPES.PUBLIC);
    const associations = publicSubnetKeys.map(subnetLogicalId => {
      const logicalId = this.provider.naming.getSubnetRouteTableAssociationLogicalId(
        subnetLogicalId
      );
      return {
        [logicalId]: getSubnetRouteTableAssociationTemplate(subnetLogicalId, routeTableLogicalId),
      };
    });
    Object.assign(Resources, ...associations);
  }

  if (privateSubnetKeys.length) {
    const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId(SUBNET_TYPES.PRIVATE);
    const associations = privateSubnetKeys.map(subnetLogicalId => {
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
