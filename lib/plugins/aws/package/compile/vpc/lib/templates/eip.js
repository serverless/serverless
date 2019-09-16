'use strict';

function getEipTemplate(vpcName) {
  return {
    Type: 'AWS::EC2::EIP',
    DependsOn: vpcName,
    Properties: {
      Domain: 'vpc',
    },
  };
}

module.exports = getEipTemplate;
