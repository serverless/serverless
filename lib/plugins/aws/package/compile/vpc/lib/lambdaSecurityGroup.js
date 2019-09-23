'use strict';

const getSecurityGroupTemplate = require('./templates/securityGroup');

function compileLambdaSecurityGroup() {
  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const logicalId = this.provider.naming.getLambdaSecurityGroupLogicalId();
  const vpcLogicalId = this.provider.naming.getVpcLogicalId();
  const description = 'SecurityGroup for Serverless Functions';

  const securityGroupResource = {
    [logicalId]: getSecurityGroupTemplate(vpcLogicalId, description),
  };

  Object.assign(Resources, securityGroupResource);
}

module.exports = { compileLambdaSecurityGroup };
