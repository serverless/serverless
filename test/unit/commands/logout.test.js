'use strict';

const { expect } = require('chai');
const proxyquire = require('proxyquire');

const configUtils = require('@serverless/utils/config');
const logout = require('../../../commands/logout');

describe('test/unit/commands/logout.test.js', async () => {
  before(async () => {
    const login = proxyquire('../../../lib/commands/login/dashboard', {
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

    await login();
    await logout();
  });

  it('should logout', async () => {
    expect(configUtils.getLoggedInUser()).to.equal(null);
  });
});
