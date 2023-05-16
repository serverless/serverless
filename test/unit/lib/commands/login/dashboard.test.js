'use strict';

const { expect } = require('chai');
const proxyquire = require('proxyquire');

const configUtils = require('@serverless/utils/config');

describe('test/unit/lib/commands/login/dashboard.test.js', async () => {
  before(async () => {
    const login = proxyquire('../../../../../lib/commands/login/dashboard', {
      'open': () => {},
      '@serverless/platform-client': {
        ServerlessSDK: class ServerlessSDK {
          login() {
            return {
              loginUrl: 'http://',
              loginData: Promise.resolve({
                id: 'id',
                name: 'name',
                email: 'email',
                username: 'username',
                user_uid: 'user_uid',
                refreshToken: 'refreshToken',
                accessToken: 'accessToken',
                idToken: 'idToken',
                expiresAt: 86400,
              }),
            };
          }
        },
      },
    });

    await login({ options: {} });
  });

  it('should login', async () => {
    const userData = configUtils.getLoggedInUser();
    expect(userData.userId).to.equal('user_uid');
    expect(userData.refreshToken).to.equal('refreshToken');
  });
});
