'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - Cognito User Pool Trigger: Single event with single function', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger function when PreSignUp event is triggered', () => Utils
    .createCognitoUser('CognitoUserPoolAwsnodejs-1', 'test@test.com', 'password123')
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('preSignUp');
      expect(/"triggerSource":"preSignup"/g.test(logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
