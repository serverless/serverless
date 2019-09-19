'use strict';

function getSecurityGroupTemplate(vpcLogicalId, description) {
  return {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      VpcId: {
        Ref: vpcLogicalId,
      },
      GroupDescription: description,
    },
  };
}

module.exports = getSecurityGroupTemplate;
