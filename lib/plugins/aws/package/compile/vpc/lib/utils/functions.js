'use strict';

const { SUBNET_TYPES } = require('./constants');

function flatMap(f, xs) {
  return xs.reduce((accum, x) => accum.concat(f(x)), []);
}

function getSubnetTypeKeys(type) {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const subnetRegex = this.provider.naming.getSubnetLogicalIdRegex();
  const keys =
    Object.keys(Resources).filter(
      key => key.match(subnetRegex) && key.includes(SUBNET_TYPES[type.toUpperCase()])
    ) || [];
  return keys;
}

module.exports = {
  flatMap,
  getSubnetTypeKeys,
};
