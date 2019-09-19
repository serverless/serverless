'use strict';

function getInterentGatewayTemplate() {
  return {
    Type: 'AWS::EC2::InternetGateway',
    Properties: {
      Tags: [
        {
          Key: 'Name',
          Value: {
            'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, 'gateway']],
          },
        },
      ],
    },
  };
}

module.exports = getInterentGatewayTemplate;
