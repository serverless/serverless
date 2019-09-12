'use strict';

function getVpcTemplate(cidrBlock = '10.0.0.0/16') {
  return {
    Type: 'Aws::EC2::VPC',
    Properties: {
      CidrBlock: cidrBlock,
      EnableDnsSupport: true,
      EnableDnsHostNames: true,
      InstanceTenancy: 'default',
      Tags: [
        {
          Key: 'Name',
          Value: {
            Ref: 'AWS::StackName',
          },
        },
      ],
    },
  };
}

module.exports = getVpcTemplate;
