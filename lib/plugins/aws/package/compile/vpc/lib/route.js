'use strict';

const BbPromise = require('bluebird');
const getRouteTemplate = require('./templates/route');

function compileRoute() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getRouteLogicalId();
  const internetGatewayName = this.provider.naming.getInternetGatewayLogicalId();
  const routeTableName = this.provider.naming.getRouteTableLogicalId();
  const vpcGatewayAttachmentName = this.provider.naming.getVpcGatewayAttachmentLogicalId();

  const routeResource = {
    [logicalId]: getRouteTemplate(internetGatewayName, routeTableName, vpcGatewayAttachmentName),
  };

  Object.assign(Resources, routeResource);

  return BbPromise.resolve();
}

module.exports = { compileRoute };
