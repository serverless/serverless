'use strict';

const getVpcTemplate = require('./templates/vpc');

function compileVpc() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getVpcLogicalId();

  const vpcResource = { [logicalId]: getVpcTemplate() };

  Object.assign(Resources, vpcResource);
}

module.exports = { compileVpc };
