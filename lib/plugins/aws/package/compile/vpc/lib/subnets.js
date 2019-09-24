'use strict';

const { SUBNET_TYPES, SUBNET_CONFIG } = require('./utils/constants');
const { flatMap, isEmptyObject } = require('./utils/functions');
const getSubnetTemplate = require('./templates/subnet');

function compileSubnets(subnetConfigs) {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const types = [SUBNET_TYPES.PRIVATE, SUBNET_TYPES.PUBLIC];
  // NOTE: previously we loaded the supported regions from `./utils/constants`
  // we keep the `flatMap` code intact to allow multi-region azs later on
  const availabilityZones = flatMap(region => [`${region}a`], [this.options.region]);
  const vpcLogicalId = this.provider.naming.getVpcLogicalId();

  let privateCidrBlock;
  let publicCidrBlock;
  if (!isEmptyObject(subnetConfigs)) {
    privateCidrBlock = subnetConfigs.private ? subnetConfigs.private.cidrBlock : null;
    publicCidrBlock = subnetConfigs.public ? subnetConfigs.public.cidrBlock : null;
  }

  const resources = flatMap(az => {
    return types.map(type => {
      let cidrBlock;
      const logicalId = this.provider.naming.getSubnetLogicalId(`${type}${az}`);
      if (type === SUBNET_TYPES.PRIVATE) {
        cidrBlock = privateCidrBlock || SUBNET_CONFIG.PRIVATE_CIDR;
      } else {
        cidrBlock = publicCidrBlock || SUBNET_CONFIG.PUBLIC_CIDR;
      }
      return {
        [logicalId]: getSubnetTemplate(vpcLogicalId, az, cidrBlock),
      };
    });
  }, availabilityZones);

  Object.assign(Resources, ...resources);
}

module.exports = { compileSubnets };
