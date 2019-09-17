'use strict';

const BbPromise = require('bluebird');
const { getSubnetTypeKeys } = require('./utils/functions');
const getNatGatewayTemplate = require('./templates/natGateway');

function compileNatGateways() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const publicSubnetKeys = getSubnetTypeKeys.call(this, 'public');

  if (publicSubnetKeys.length) {
    const eipLogicalId = this.provider.naming.getEipLogicalId();
    const associations = publicSubnetKeys.map(subnetLogicalId => {
      const logicalId = this.provider.naming.getNatGatewayLogicalId(subnetLogicalId);
      return {
        [logicalId]: getNatGatewayTemplate(eipLogicalId, subnetLogicalId),
      };
    });
    Object.assign(Resources, ...associations);
  }

  return BbPromise.resolve();
}

module.exports = { compileNatGateways };
