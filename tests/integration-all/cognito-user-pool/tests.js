'use strict';

const path = require('path');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const {
  createUserPool,
  deleteUserPool,
  findUserPoolByName,
  createUser,
} = require('../../utils/cognito');
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/misc');
const { getMarkers } = require('../shared/utils');

describe('AWS - Cognito User Pool Integration Test', () => {
  let serviceName;
  let stackName;
  let tmpDirPath;
  let poolBasicSetup;
  let poolExistingSetup;
  const stage = 'dev';

  beforeAll(() => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique user pool names for each test (to avoid collision among concurrent CI runs)
        config => {
          poolBasicSetup = `${config.service}-cup-basic`;
          poolExistingSetup = `${config.service}-cup-existing`;
          config.functions.basic.events[0].cognitoUserPool.pool = poolBasicSetup;
          config.functions.existing.events[0].cognitoUserPool.pool = poolExistingSetup;
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    // create an external Cognito User Pool
    // NOTE: deployment can only be done once the Cognito User Pool is created
    console.info(`Creating Cognito User Pool "${poolExistingSetup}"...`);
    return createUserPool(poolExistingSetup).then(() => {
      console.info(`Deploying "${stackName}" service...`);
      deployService();
    });
  });

  afterAll(() => {
    console.info('Removing service...');
    removeService();
    console.info(`Deleting Cognito User Pool "${poolExistingSetup}"...`);
    return deleteUserPool(poolExistingSetup);
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
        .then(() => waitForFunctionLogs(functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
          expect(logs).to.include('"userName":"johndoe"');
          expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
        });
    });
  });

  describe('Existing Setup', () => {
    it('should invoke function when a user is created', () => {
      let userPoolId;
      const functionName = 'existing';
      const markers = getMarkers(functionName);

      return findUserPoolByName(poolExistingSetup)
        .then(pool => {
          userPoolId = pool.Id;
          return createUser(userPoolId, 'janedoe', '!!!wAsD123456wAsD!!!');
        })
        .then(() => waitForFunctionLogs(functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(`"userPoolId":"${userPoolId}"`);
          expect(logs).to.include('"userName":"janedoe"');
          expect(logs).to.include('"triggerSource":"PreSignUp_AdminCreateUser"');
        });
    });
  });
});
