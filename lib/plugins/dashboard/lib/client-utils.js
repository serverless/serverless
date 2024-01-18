'use strict';

const { ServerlessSDK } = require('@serverless/platform-client');
const accountUtils = require('@serverless/utils/account');
const configUtils = require('@serverless/utils/config');

const createAccessKeyForOrg = async (orgName) => {
  const sdk = new ServerlessSDK();

  await accountUtils.refreshToken(sdk);

  const user = configUtils.getLoggedInUser();

  if (!user || !user.idToken) {
    return null;
  }

  sdk.config({ accessKey: user.idToken });

  const accessKeyTitle = `serverless_${Math.round(+new Date() / 1000)}`;
  const result = await sdk.accessKeys.create(orgName, user.username, accessKeyTitle);

  configUtils.set({
    users: {
      [user.userId]: {
        dashboard: { accessKeys: { [orgName]: result.secretAccessKey } },
      },
    },
  });

  return result.secretAccessKey;
};

const getOrCreateAccessKeyForOrg = async (orgName) => {
  if (process.env.SERVERLESS_ACCESS_KEY) {
    return process.env.SERVERLESS_ACCESS_KEY;
  }

  const user = configUtils.getLoggedInUser();

  if (!user) {
    throw new Error('Could not find logged in user. Please log in.');
  }

  // Try to get existing access key for specifier orgName
  const accessKeyFromConfig = user.accessKeys && user.accessKeys[orgName];

  if (accessKeyFromConfig) {
    return accessKeyFromConfig;
  }

  // Try to create a new access key if not found existing one
  const createdAccessKey = await createAccessKeyForOrg(orgName);

  if (!createdAccessKey) {
    throw new Error('Could not create a new access key. Please log out and log in and try again.');
  }

  return createdAccessKey;
};

const getPlatformClientWithAccessKey = async (orgName) => {
  const accessKey = await getOrCreateAccessKeyForOrg(orgName);

  const sdk = new ServerlessSDK({ accessKey });

  return sdk;
};

module.exports = {
  getPlatformClientWithAccessKey,
  getOrCreateAccessKeyForOrg,
};
