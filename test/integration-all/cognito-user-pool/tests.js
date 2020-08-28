'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const { expect } = require('chai');
const log = require('log').get('serverless:test');
const hasFailed = require('@serverless/test/has-failed');

const { getTmpDirPath } = require('../../utils/fs');
const {
  createUserPool,
  deleteUserPool,
  findUserPoolByName,
  describeUserPool,
  createUser,
  createUserPoolClient,
  setUserPassword,
  initiateAuth,
} = require('../../utils/cognito');
const { createTestService, deployService, removeService } = require('../../utils/integration');
const { confirmCloudWatchLogs } = require('../../utils/misc');

describe('AWS - Cognito User Pool Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let poolBasicSetup;
  let poolExistingSimpleSetup;
  let poolExistingMultiSetup;
  let poolExistingSimpleSetupConfig;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    log.notice(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique user pool names for each test (to avoid collision among concurrent CI runs)
        config => {
          poolBasicSetup = `${config.service} CUP Basic`;
          poolExistingSimpleSetup = `${config.service} CUP Existing Simple`;
          poolExistingMultiSetup = `${config.service} CUP Existing Multi`;
          config.functions.basic.events[0].cognitoUserPool.pool = poolBasicSetup;
          config.functions.existingSimple.events[0].cognitoUserPool.pool = poolExistingSimpleSetup;
          config.functions.existingMulti.events[0].cognitoUserPool.pool = poolExistingMultiSetup;
          config.functions.existingMulti.events[1].cognitoUserPool.pool = poolExistingMultiSetup;
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    // create external Cognito User Pools
    // the simple pool setup has some additional configuration when we set it up
    poolExistingSimpleSetupConfig = {
      EmailVerificationMessage: 'email{####}message',
      EmailVerificationSubject: 'email{####}subject',
    };
    // NOTE: deployment can only be done once the Cognito User Pools are created
    log.notice('Creating Cognito User Pools');
    await BbPromise.all([
      createUserPool(poolExistingSimpleSetup, poolExistingSimpleSetupConfig),
      createUserPool(poolExistingMultiSetup),
    ]);
    log.notice(`Deploying "${stackName}" service...`);
    return deployService(tmpDirPath);
  });

  after(async function() {
    // Do not clean on fail, to allow further state investigation
    if (hasFailed(this.test.parent)) return null;
    log.notice('Removing service...');
    await removeService(tmpDirPath);
    log.notice('Deleting Cognito User Pools');
    return BbPromise.all([
      deleteUserPool(poolExistingSimpleSetup),
      deleteUserPool(poolExistingMultiSetup),
    ]);
  });

  describe('Basic Setup', () => {
    it('should invoke function when a user is created', async () => {
      const functionName = 'basic';

      const { Id: userPoolId } = await findUserPoolByName(poolBasicSetup);
      await createUser(userPoolId, 'johndoe', '!!!wAsD123456wAsD!!!');
      const events = await confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        async () => {}
      );
      const logs = events.reduce((data, event) => data + event.message, '');
      expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
      expect(logs).to.include('"userName":"johndoe"');
      expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
    });
  });

  describe('Existing Setup', () => {
    describe('single function / single pool setup', () => {
      it('should invoke function when a user is created', async () => {
        const functionName = 'existingSimple';

        const { Id: userPoolId } = await findUserPoolByName(poolExistingSimpleSetup);
        await createUser(userPoolId, 'janedoe', '!!!wAsD123456wAsD!!!');
        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          async () => {}
        );
        const logs = events.reduce((data, event) => data + event.message, '');

        expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
        expect(logs).to.include('"userName":"janedoe"');
        expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
      });

      it('should not overwrite existing User Pool configurations', async () => {
        const { Id: userPoolId } = await findUserPoolByName(poolExistingSimpleSetup);
        const config = await describeUserPool(userPoolId);
        expect(config.UserPool.EmailVerificationMessage).to.equal(
          poolExistingSimpleSetupConfig.EmailVerificationMessage
        );
        expect(config.UserPool.EmailVerificationSubject).to.equal(
          poolExistingSimpleSetupConfig.EmailVerificationSubject
        );
      });
    });

    describe('single function / multi pool setup', () => {
      it('should invoke function when a user inits auth after being created', async () => {
        const functionName = 'existingMulti';
        const username = 'janedoe';
        const password = '!!!wAsD123456wAsD!!!';

        const { Id: userPoolId } = await findUserPoolByName(poolExistingMultiSetup);
        const client = await createUserPoolClient('myClient', userPoolId);
        const clientId = client.UserPoolClient.ClientId;
        await createUser(userPoolId, username, password);
        await setUserPassword(userPoolId, username, password);
        await initiateAuth(clientId, username, password);
        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          async () => {},
          {
            checkIsComplete: soFarEvents =>
              soFarEvents
                .reduce((data, event) => data + event.message, '')
                .includes('PreAuthentication_Authentication'),
          }
        );
        const logs = events.reduce((data, event) => data + event.message, '');

        expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
        expect(logs).to.include(`"userName":"${username}"`);
        expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
        expect(logs).to.include('"triggerSource":"PreAuthentication_Authentication"');
      });
    });
  });
});
