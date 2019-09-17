'use strict';

const BbPromise = require('bluebird');
const { SUBNET_TYPES } = require('./utils/constants');
const { getSubnetTypeKeys } = require('./utils/functions');
const getRouteTemplate = require('./templates/route');

function compileRoutes() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const vpcGatewayAttachmentLogicalId = this.provider.naming.getVpcGatewayAttachmentLogicalId();

  // 1 route for each NatGateway
  const natGatewayLogicalIds = getSubnetTypeKeys
    .call(this, 'public')
    .map(key => this.provider.naming.getNatGatewayLogicalId(key));
  const natGatewayRouteResources = natGatewayLogicalIds.map(natGatewayLogicalId => {
    const logicalId = this.provider.naming.getRouteLogicalId(natGatewayLogicalId);
    const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId(SUBNET_TYPES.PUBLIC);
    return {
      [logicalId]: getRouteTemplate(
        'nat',
        routeTableLogicalId,
        natGatewayLogicalId,
        vpcGatewayAttachmentLogicalId
      ),
    };
  });

  // 1 route for each InternetGateway (there's only one)
  const internetGatewayLogicalId = this.provider.naming.getInternetGatewayLogicalId();
  const logicalId = this.provider.naming.getRouteLogicalId(internetGatewayLogicalId);
  const routeTableLogicalId = this.provider.naming.getRouteTableLogicalId(SUBNET_TYPES.PRIVATE);
  const internetGatewayResource = {
    [logicalId]: getRouteTemplate(
      'internet',
      routeTableLogicalId,
      internetGatewayLogicalId,
      vpcGatewayAttachmentLogicalId
    ),
  };

  const resourcesToMerge = [...natGatewayRouteResources, internetGatewayResource];

  Object.assign(Resources, ...resourcesToMerge);

  return BbPromise.resolve();
}

module.exports = { compileRoutes };
