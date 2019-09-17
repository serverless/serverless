'use strict';

function getEipTemplate(DependsOn) {
  return {
    Type: 'AWS::EC2::EIP',
    DependsOn: DependsOn || undefined,
    Properties: {
      Domain: 'vpc',
    },
  };
}

module.exports = getEipTemplate;
