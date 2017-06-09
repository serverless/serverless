'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - Cognito User Pool: Single User Pool with single ' +
  'event with single function', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should call the specified function when PreSignUp event is triggered', () => Utils
    .getCognitoUserPoolId(process.env.COGNITO_USER_POOL_1)
    .then((poolId) =>
      Utils.createCognitoUser(poolId, 'test@test.com', 'Password123!')
    )
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('preSignUp');
      expect(/"triggerSource":"PreSignUp_\w+"/g.test(logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
