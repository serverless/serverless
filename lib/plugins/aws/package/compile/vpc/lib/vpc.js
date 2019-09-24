'use strict';

const getVpcTemplate = require('./templates/vpc');
const { isEmptyObject } = require('./utils/functions');

function compileVpc(vpcConfig) {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getVpcLogicalId();

  let cidrBlock;
  if (!isEmptyObject(vpcConfig)) {
    cidrBlock = vpcConfig.cidrBlock;
  }

  const vpcResource = { [logicalId]: getVpcTemplate(cidrBlock) };

  Object.assign(Resources, vpcResource);
}

module.exports = { compileVpc };
