'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const { expect } = require('chai');

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
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/integration');
const { getMarkers } = require('../shared/utils');

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
    console.info(`Temporary path: ${tmpDirPath}`);
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
    console.info('Creating Cognito User Pools');
    return BbPromise.all([
      createUserPool(poolExistingSimpleSetup, poolExistingSimpleSetupConfig),
      createUserPool(poolExistingMultiSetup),
    ]).then(() => {
      console.info(`Deploying "${stackName}" service...`);
      return deployService(tmpDirPath);
    });
  });

  after(async () => {
    console.info('Removing service...');
    await removeService(tmpDirPath);
    console.info('Deleting Cognito User Pools');
    return BbPromise.all([
      deleteUserPool(poolExistingSimpleSetup),
      deleteUserPool(poolExistingMultiSetup),
    ]);
  });

  describe('Basic Setup', () => {
    it('should invoke function when a user is created', () => {
      let userPoolId;
      const functionName = 'basic';
      const markers = getMarkers(functionName);

      return findUserPoolByName(poolBasicSetup)
        .then(pool => {
          userPoolId = pool.Id;
          return createUser(userPoolId, 'johndoe', '!!!wAsD123456wAsD!!!');
        })
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
          expect(logs).to.include('"userName":"johndoe"');
          expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
        });
    });
  });

  describe('Existing Setup', () => {
    describe('single function / single pool setup', () => {
      it('should invoke function when a user is created', () => {
        let userPoolId;
        const functionName = 'existingSimple';
        const markers = getMarkers(functionName);

        return findUserPoolByName(poolExistingSimpleSetup)
          .then(pool => {
            userPoolId = pool.Id;
            return createUser(userPoolId, 'janedoe', '!!!wAsD123456wAsD!!!');
          })
          .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
          .then(logs => {
            expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
            expect(logs).to.include('"userName":"janedoe"');
            expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
          });
      });

      it('should not overwrite existing User Pool configurations', () => {
        return findUserPoolByName(poolExistingSimpleSetup).then(pool => {
          return describeUserPool(pool.Id).then(config => {
            expect(config.UserPool.EmailVerificationMessage).to.equal(
              poolExistingSimpleSetupConfig.EmailVerificationMessage
            );
            expect(config.UserPool.EmailVerificationSubject).to.equal(
              poolExistingSimpleSetupConfig.EmailVerificationSubject
            );
          });
        });
      });
    });

    describe('single function / multi pool setup', () => {
      it('should invoke function when a user inits auth after being created', () => {
        let userPoolId;
        let clientId;
        const functionName = 'existingMulti';
        const markers = getMarkers(functionName);
        const username = 'janedoe';
        const password = '!!!wAsD123456wAsD!!!';

        return findUserPoolByName(poolExistingMultiSetup)
          .then(pool => {
            userPoolId = pool.Id;
            return createUserPoolClient('myClient', userPoolId).then(client => {
              clientId = client.UserPoolClient.ClientId;
              return createUser(userPoolId, username, password)
                .then(() => setUserPassword(userPoolId, username, password))
                .then(() => initiateAuth(clientId, username, password));
            });
          })
          .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
          .then(logs => {
            expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
            expect(logs).to.include(`"userName":"${username}"`);
            expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
            expect(logs).to.include('"triggerSource":"PreAuthentication_Authentication"');
          });
      });
    });
  });
});
