'use strict';

const BbPromise = require('bluebird');
const getVpcTemplate = require('./templates/vpc');

function compileVpc() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getVpcLogicalId();

  const vpcResource = { [logicalId]: getVpcTemplate() };

  Object.assign(Resources, vpcResource);

  return BbPromise.resolve();
}

module.exports = { compileVpc };
