'use strict';

function getSecurityGroupTemplate(vpcLogicalId) {
  return {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      VpcId: vpcLogicalId,
    },
  };
}

module.exports = getSecurityGroupTemplate;
