'use strict';

// const getFrameworkId = require('../../utils/getFrameworkId');
// const segment = require('../../utils/segment');
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
    const globalConfig = configUtils.getGlobalConfig();
    const currentUserId = config.currentUserId;

    const logout = () => {
      try {
        // TODO Once we start using refresh tokens we also need to implement an API endpoint
        // that invalidate a refresh token in Auth0 (using the Auth0 Management API).
        // This endpoint should be called when the user runs `serverless logout` in the CLI.
        if (globalConfig && globalConfig.users && globalConfig.users[currentUserId]) {
          configUtils.set(`users.${currentUserId}.auth`, null);
        }
        console.log('Successfully logged out.'); // eslint-disable-line
        // Note no need to wait for any connections e.g. segment to close
        process.exit(0);
      } catch (e) {
        console.log('Failed to logout. Please manually remove this file: '); // eslint-disable-line
        // Note no need to wait for any connections e.g. segment to close
        process.exit(0);
      }
    };
    logout();
    // track('logout').then(() => {
    //   logout()
    // })
    // .catch(() => {
    //   logout()
    // })
  }
}

module.exports = Login;
