'use strict';

const BbPromise = require('bluebird');
const { getPublicSubnetKeys } = require('./utils/functions');
const getSubnetRouteTableAssociationTemplate = require('./templates/subnetRouteTableAssociation');

function compileSubnetRouteTableAssociations() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const publicSubnetKeys = getPublicSubnetKeys.call(this);

  if (publicSubnetKeys.length) {
    const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId();
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

  return BbPromise.resolve();
}

module.exports = {
  compileSubnetRouteTableAssociations,
};
