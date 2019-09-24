'use strict';

const getVpcTemplate = require('./templates/vpc');
const { isObject, isEmpty } = require('lodash');

function compileVpc(vpcConfig) {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getVpcLogicalId();

  let cidrBlock;
  if (isObject(vpcConfig) && !isEmpty(vpcConfig)) {
    cidrBlock = vpcConfig.cidrBlock;
  }

  const vpcResource = { [logicalId]: getVpcTemplate(cidrBlock) };

  Object.assign(Resources, vpcResource);
}

module.exports = compileVpc;
