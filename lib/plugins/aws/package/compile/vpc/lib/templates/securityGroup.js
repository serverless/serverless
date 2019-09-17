'use strict';

const { SECURITY_GROUP } = require('../utils/constants');

function getSecurityGroupTemplate(
  vpcLogicalId,
  SecurityGroupIngress = SECURITY_GROUP.DEFAULT_INGRESS,
  SecurityGroupEgress = SECURITY_GROUP.DEFAULT_EGRESS
) {
  return {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      VpcId: vpcLogicalId,
      SecurityGroupIngress,
      SecurityGroupEgress,
    },
  };
}

module.exports = getSecurityGroupTemplate;
