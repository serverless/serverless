'use strict';

const BbPromise = require('bluebird');
const { expect } = require('chai');
const log = require('log').get('serverless:test');
const hasFailed = require('@serverless/test/has-failed');
const fixtures = require('../../fixtures/programmatic');

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
const { deployService, removeService } = require('../../utils/integration');
const { confirmCloudWatchLogs } = require('../../utils/misc');

describe('AWS - Cognito User Pool Integration Test', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let stackName;
  let serviceDir;
  let poolBasicSetup;
  let poolCustomEmailSenderSetup;
  let poolExistingSimpleSetup;
  let poolExistingMultiSetup;
  let poolExistingCustomEmailSenderSetup;
  let poolExistingSimpleSetupConfig;
  let poolExistingCustomEmailSenderSetupConfig;
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('cognito-user-pool');
    ({ servicePath: serviceDir } = serviceData);
    const serviceName = serviceData.serviceConfig.service;
    stackName = `${serviceName}-${stage}`;

    poolBasicSetup = `${serviceName} CUP Basic`;
    poolCustomEmailSenderSetup = `${serviceName} CUP CustomEmailSender`;
    poolExistingSimpleSetup = `${serviceName} CUP Existing Simple`;
    poolExistingMultiSetup = `${serviceName} CUP Existing Multi`;
    poolExistingCustomEmailSenderSetup = `${serviceName} CUP Existing CustomEmailSender`;

    // create external Cognito User Pools
    // the simple pool setup has some additional configuration when we set it up
    poolExistingSimpleSetupConfig = {
      EmailVerificationMessage: 'email{####}message',
      EmailVerificationSubject: 'email{####}subject',
      SmsVerificationMessage: 'sms{####}message',
    };
    poolExistingCustomEmailSenderSetupConfig = {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
      EmailVerificationMessage: 'email message: {####}',
      EmailVerificationSubject: 'email subject: {####}',
    };
    // NOTE: deployment can only be done once the Cognito User Pools are created
    log.notice('Creating Cognito User Pools');
    await BbPromise.all([
      createUserPool(poolExistingSimpleSetup, poolExistingSimpleSetupConfig),
      createUserPool(poolExistingMultiSetup),
      createUserPool(poolExistingCustomEmailSenderSetup, poolExistingCustomEmailSenderSetupConfig),
    ]);
    return deployService(serviceDir);
  });

  after(async function () {
    if (!serviceDir) return null;
    // Do not clean on fail, to allow further state investigation
    if (hasFailed(this.test.parent)) return null;
    log.notice('Removing service...');
    await removeService(serviceDir);
    log.notice('Deleting Cognito User Pools');
    return BbPromise.all([
      deleteUserPool(poolExistingSimpleSetup),
      deleteUserPool(poolExistingMultiSetup),
      deleteUserPool(poolExistingCustomEmailSenderSetup),
    ]);
  });

  describe('New Setup', () => {
    describe('Basic Setup', () => {
      it('should invoke function when a user is created', async () => {
        const functionName = 'basic';

        const { Id: userPoolId } = await findUserPoolByName(poolBasicSetup);

        let counter = 0;
        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          async () => createUser(userPoolId, `johndoe${++counter}`, '!!!wAsD123456wAsD!!!'),
          {
            checkIsComplete: (soFarEvents) => {
              const logs = soFarEvents.reduce((data, event) => data + event.message, '');
              return logs.includes('userName');
            },
          }
        );
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
        expect(logs).to.include('"userName":"johndoe');
        expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
      });
    });

    describe('Custom Sender Trigger', () => {
      it('should invoke function when a user is created and sent verification code via email', async () => {
        const functionName = 'customEmailSender';

        const { Id: userPoolId } = await findUserPoolByName(poolCustomEmailSenderSetup);

        let counter = 0;
        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          async () =>
            createUser(
              userPoolId,
              `janedoe${++counter}@email.com`,
              '!!!wAsD123456wAsD!!!',
              'email'
            ),
          {
            checkIsComplete: (soFarEvents) =>
              soFarEvents
                .reduce((data, event) => data + event.message, '')
                .includes('customEmailSenderRequestV1'),
          }
        );
        const logs = events.reduce((data, event) => data + event.message, '');

        expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
        expect(logs).to.include('"userName":"janedoe');
        expect(logs).to.include('"type":"customEmailSenderRequestV1"');
      });
    });
  });

  describe('Existing Setup', () => {
    describe('single function / single trigger pool setup', () => {
      it('should invoke function when a user is created', async () => {
        const functionName = 'existingSimple';

        const { Id: userPoolId } = await findUserPoolByName(poolExistingSimpleSetup);

        let counter = 0;
        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          async () => createUser(userPoolId, `janedoe${++counter}`, '!!!wAsD123456wAsD!!!'),
          {
            checkIsComplete: (soFarEvents) => {
              const logs = soFarEvents.reduce((data, event) => data + event.message, '');
              return logs.includes('PreSignUp_AdminCreateUser');
            },
          }
        );
        const logs = events.reduce((data, event) => data + event.message, '');

        expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
        expect(logs).to.include('"userName":"janedoe');
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

    describe('single function / multi trigger pool setup', () => {
      it('should invoke function when a user inits auth after being created', async () => {
        const functionName = 'existingMulti';
        const usernamePrefix = 'janedoe';
        const password = '!!!wAsD123456wAsD!!!';

        const { Id: userPoolId } = await findUserPoolByName(poolExistingMultiSetup);
        const client = await createUserPoolClient('myClient', userPoolId);
        const clientId = client.UserPoolClient.ClientId;

        let counter = 0;
        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          async () => {
            const username = `${usernamePrefix}${++counter}`;
            await createUser(userPoolId, username, password);
            await setUserPassword(userPoolId, username, password);
            await initiateAuth(clientId, username, password);
          },
          {
            checkIsComplete: (soFarEvents) =>
              soFarEvents
                .reduce((data, event) => data + event.message, '')
                .includes('PreAuthentication_Authentication'),
          }
        );
        const logs = events.reduce((data, event) => data + event.message, '');

        expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
        expect(logs).to.include(`"userName":"${usernamePrefix}`);
        expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
        expect(logs).to.include('"triggerSource":"PreAuthentication_Authentication"');
      });
    });

    describe('Custom Sender Trigger', () => {
      it('should invoke function when a user is created and sent verification code via email', async () => {
        const functionName = 'existingCustomEmailSender';

        const { Id: userPoolId } = await findUserPoolByName(poolExistingCustomEmailSenderSetup);

        let counter = 0;
        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          async () =>
            createUser(
              userPoolId,
              `janedoe${++counter}@email.com`,
              '!!!wAsD123456wAsD!!!',
              'email'
            ),
          {
            checkIsComplete: (soFarEvents) =>
              soFarEvents
                .reduce((data, event) => data + event.message, '')
                .includes('customEmailSenderRequestV1'),
          }
        );
        const logs = events.reduce((data, event) => data + event.message, '');

        expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
        expect(logs).to.include('"userName":"janedoe');
        expect(logs).to.include('"type":"customEmailSenderRequestV1"');
      });
    });
  });
});
