'use strict';

const BbPromise = require('bluebird');
const { SUBNET_TYPES } = require('./utils/constants');
const getSubnetRouteTableAssociationTemplate = require('./templates/subnetRouteTableAssociation');

function compileSubnetRouteTableAssociation() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const subnetRegex = this.provider.naming.getSubnetLogicalIdRegex();
  const publicSubnetKeys =
    Object.keys(Resources).filter(
      key => key.match(subnetRegex) && key.includes(SUBNET_TYPES.PUBLIC)
    ) || [];

  if (publicSubnetKeys.length) {
    const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId();
    const associations = publicSubnetKeys.map(subnetLogicalId =>
      getSubnetRouteTableAssociationTemplate(subnetLogicalId, routeTableLogicalId)
    );
    Object.assign(Resources, associations);
  }

  return BbPromise.resolve();
}

module.exports = {
  compileSubnetRouteTableAssociation,
};
