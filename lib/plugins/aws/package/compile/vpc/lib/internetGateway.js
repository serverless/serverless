'use strict';

const BbPromise = require('bluebird');
const getInternetGatewayTemplate = require('./templates/internetGateway');

function compileInternetGateway() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getInternetGatewayLogicalId();

  const internetGatewayResource = { [logicalId]: getInternetGatewayTemplate() };

  Object.assign(Resources, internetGatewayResource);

  return BbPromise.resolve();
}

module.exports = { compileInternetGateway };
