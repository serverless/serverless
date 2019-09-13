'use strict';

const BbPromise = require('bluebird');
const getRouteTableTemplate = require('./templates/routeTable');

function compileRouteTable() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getRouteTableLogicalId();
  const vpcName = this.provider.naming.getVpcLogicalId();

  const routeTableResource = { [logicalId]: getRouteTableTemplate(vpcName) };

  Object.assign(Resources, routeTableResource);

  return BbPromise.resolve();
}

module.exports = { compileRouteTable };
