'use strict';

const getInternetGatewayTemplate = require('./templates/internetGateway');

function compileInternetGateway() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getInternetGatewayLogicalId();

  const internetGatewayResource = { [logicalId]: getInternetGatewayTemplate() };

  Object.assign(Resources, internetGatewayResource);
}

module.exports = { compileInternetGateway };
