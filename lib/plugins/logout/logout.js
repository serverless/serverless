'use strict';

// const getFrameworkId = require('../../utils/getFrameworkId');
// const segment = require('../../utils/segment');
const userStats = require('../../utils/userStats');
const configUtils = require('../../utils/config');

class Login {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      logout: {
        usage: 'Logout from the Serverless Platform',
        lifecycleEvents: ['logout'],
      },
    };

    this.hooks = {
      'logout:logout': this.logout.bind(this),
    };
  }
  logout() {
    const config = configUtils.getConfig();
    const currentId = config.userId;
    const globalConfig = configUtils.getGlobalConfig();

    try {
      // TODO Once we start using refresh tokens we also need to implement an API endpoint
      // that invalidate a refresh token in Auth0 (using the Auth0 Management API).

      if (globalConfig && globalConfig.users && globalConfig.users[currentId]) {
        if (globalConfig.users[currentId].auth) {
          // remove auth tokens from user
          configUtils.set(`users.${currentId}.auth`, null);
          // log stat
          userStats.track('user_loggedOut').then(() => {
            console.log('Successfully logged out.'); // eslint-disable-line
            process.exit(0);
          });
        } else {
          console.log('You are already logged out'); // eslint-disable-line
        }
      }
    } catch (e) {
      console.log('Failed to logout. Please report bug in https://github.com/serverless/serverless/issues'); // eslint-disable-line
      // Note no need to wait for any connections e.g. segment to close
      process.exit(0);
    }
  }
}

module.exports = Login;
