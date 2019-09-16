'use strict';

const BbPromise = require('bluebird');
const { SUBNET_TYPES } = require('./utils/constants');
const getRouteTableTemplate = require('./templates/routeTable');

function compileRouteTables() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const vpcName = this.provider.naming.getVpcLogicalId();

  const routeTableResources = Object.values(SUBNET_TYPES).map(type => {
    const logicalId = this.provider.naming.getRouteTableLogicalId(type);
    return { [logicalId]: getRouteTableTemplate(vpcName) };
  });

  Object.assign(Resources, ...routeTableResources);

  return BbPromise.resolve();
}

module.exports = { compileRouteTables };
