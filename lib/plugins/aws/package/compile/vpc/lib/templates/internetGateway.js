'use strict';

function getInterentGatewayTemplate() {
  return {
    Type: 'AWS::EC2::InternetGateway',
  };
}

module.exports = getInterentGatewayTemplate;
