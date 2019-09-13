'use strict';

const BbPromise = require('bluebird');
const { REGIONS } = require('./utils/constants');
const { flatMap } = require('./utils/functions');
const getSubnetTemplate = require('./templates/subnet');

function compileSubnets() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const types = ['Public', 'Private'];
  const availabilityZones = flatMap(region => [`${region}a`, `${region}b`], REGIONS);
  const vpcName = this.provider.naming.getVpcLogicalId();

  const resources = flatMap(az => {
    return types.map(type => {
      const logicalId = this.provider.naming.getSubnetLogicalId(`${az}${type}`);
      return {
        [logicalId]: getSubnetTemplate(type, vpcName, az),
      };
    });
  }, availabilityZones);

  Object.assign(Resources, ...resources);

  return BbPromise.resolve();
}

module.exports = { compileSubnets };
