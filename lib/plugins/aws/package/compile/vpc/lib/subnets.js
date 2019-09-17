'use strict';

const BbPromise = require('bluebird');
const { REGIONS, SUBNET_TYPES } = require('./utils/constants');
const { flatMap } = require('./utils/functions');
const getSubnetTemplate = require('./templates/subnet');

function compileSubnets() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const types = [SUBNET_TYPES.PRIVATE, SUBNET_TYPES.PUBLIC];
  const availabilityZones = flatMap(region => [`${region}a`, `${region}b`], REGIONS);
  const vpcLogicalId = this.provider.naming.getVpcLogicalId();

  const resources = flatMap(az => {
    return types.map(type => {
      const logicalId = this.provider.naming.getSubnetLogicalId(`${type}${az}`);
      return {
        [logicalId]: getSubnetTemplate(type, vpcLogicalId, az),
      };
    });
  }, availabilityZones);

  Object.assign(Resources, ...resources);

  return BbPromise.resolve();
}

module.exports = { compileSubnets };
