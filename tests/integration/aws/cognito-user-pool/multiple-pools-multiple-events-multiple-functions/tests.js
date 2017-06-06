'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - Cognito User Pool: Multiple User Pools with multiple ' +
  'events with multiple functions', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should call the specified function on the first User Pool when PreSignUp ' +
    'event is triggered', () => Utils
    .getCognitoUserPoolId(process.env.COGNITO_USER_POOL_1)
    .then((poolId) =>
      Promise.all([
        poolId,
        Utils.createCognitoUser(poolId, 'test@test.com', 'Password123!'),
      ])
    )
    .delay(60000)
    .then((promiseResponse) => {
      const poolId = promiseResponse[0];
      const logs = Utils.getFunctionLogs('preSignUp1');

      expect(RegExp(`"userPoolId":"${poolId}"`, 'g').test(logs)).to.equal(true);
      expect(/"triggerSource":"PreSignUp_\w+"/g.test(logs)).to.equal(true);
    })
  );

  it('should call the specified function on the first User Pool when CustomMessage ' +
    'event is triggered', () => Utils
    .getCognitoUserPoolId(process.env.COGNITO_USER_POOL_1)
    .then((poolId) => {
      const logs = Utils.getFunctionLogs('customMessage1');

      expect(RegExp(`"userPoolId":"${poolId}"`, 'g').test(logs)).to.equal(true);
      expect(/"triggerSource":"CustomMessage_AdminCreateUser"/g.test(logs)).to.equal(true);
    })
  );

  it('should call the specified function on the second User Pool when PreSignUp ' +
    'event is triggered', () => Utils
    .getCognitoUserPoolId(process.env.COGNITO_USER_POOL_2)
    .then((poolId) =>
      Promise.all([
        poolId,
        Utils.createCognitoUser(poolId, 'test@test.com', 'Password123!'),
      ])
    )
    .delay(60000)
    .then((promiseResponse) => {
      const poolId = promiseResponse[0];
      const logs = Utils.getFunctionLogs('preSignUp2');

      expect(RegExp(`"userPoolId":"${poolId}"`, 'g').test(logs)).to.equal(true);
      expect(/"triggerSource":"PreSignUp_\w+"/g.test(logs)).to.equal(true);
    })
  );

  it('should call the specified function on the second User Pool when CustomMessage ' +
    'event is triggered', () => Utils
    .getCognitoUserPoolId(process.env.COGNITO_USER_POOL_2)
    .then((poolId) => {
      const logs = Utils.getFunctionLogs('customMessage2');

      expect(RegExp(`"userPoolId":"${poolId}"`, 'g').test(logs)).to.equal(true);
      expect(/"triggerSource":"CustomMessage_AdminCreateUser"/g.test(logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
