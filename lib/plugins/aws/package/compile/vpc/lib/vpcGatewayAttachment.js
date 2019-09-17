'use strict';

const BbPromise = require('bluebird');
const getVpcGatewayAttachmentTemplate = require('./templates/vpcGatewayAttachment');

function compileVpcGatewayAttachment() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getVpcGatewayAttachmentLogicalId();
  const vpcLogicalId = this.provider.naming.getVpcLogicalId();
  const internetGatewayLogicalId = this.provider.naming.getInternetGatewayLogicalId();

  const vpcGatewayAttachmentResource = {
    [logicalId]: getVpcGatewayAttachmentTemplate(vpcLogicalId, internetGatewayLogicalId),
  };

  Object.assign(Resources, vpcGatewayAttachmentResource);

  return BbPromise.resolve();
}

module.exports = { compileVpcGatewayAttachment };
