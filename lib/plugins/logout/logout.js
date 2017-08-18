'use strict';

const userStats = require('../../utils/userStats');
const configUtils = require('../../utils/config');

class Logout {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      logout: {
        usage: 'Logout from the Serverless Platform',
        lifecycleEvents: ['logout'],
        platform: true,
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
            this.serverless.cli.consoleLog('Successfully logged out.');
            process.exit(0);
          });
        } else {
          this.serverless.cli.consoleLog('You are already logged out');
        }
      }
    } catch (e) {
      this.serverless.cli.consoleLog(
        'Failed to logout. Please report bug in https://github.com/serverless/serverless/issues');
      // Note no need to wait for any connections e.g. segment to close
      process.exit(0);
    }
  }
}

module.exports = Logout;
