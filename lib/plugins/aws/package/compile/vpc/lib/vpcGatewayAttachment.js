'use strict';

const BbPromise = require('bluebird');
const getVpcGatewayAttachmentTemplate = require('./templates/vpcGatewayAttachment');

function compileVpcGatewayAttachment() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getVpcGatewayAttachmentLogicalId();
  const vpcName = this.provider.naming.getVpcLogicalId();
  const internetGatewayName = this.provider.naming.getInternetGatewayLogicalId();

  const vpcGatewayAttachmentResource = {
    [logicalId]: getVpcGatewayAttachmentTemplate(vpcName, internetGatewayName),
  };

  Object.assign(Resources, vpcGatewayAttachmentResource);

  return BbPromise.resolve();
}

module.exports = { compileVpcGatewayAttachment };
