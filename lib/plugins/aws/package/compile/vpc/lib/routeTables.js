'use strict';

const { SUBNET_TYPES } = require('./utils/constants');
const getRouteTableTemplate = require('./templates/routeTable');

function compileRouteTables() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const vpcLogicalId = this.provider.naming.getVpcLogicalId();

  const subnetTypes = Object.keys(SUBNET_TYPES).map(k => SUBNET_TYPES[k]);

  const routeTableResources = subnetTypes.map(type => {
    const logicalId = this.provider.naming.getRouteTableLogicalId(type);
    return { [logicalId]: getRouteTableTemplate(vpcLogicalId) };
  });

  Object.assign(Resources, ...routeTableResources);
}

module.exports = { compileRouteTables };
