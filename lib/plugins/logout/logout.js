'use strict';

// const getFrameworkId = require('../../utils/getFrameworkId');
// const segment = require('../../utils/segment');
const config = require('../../utils/config');

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
    const configuration = config.getAll();

    if (configuration && !configuration.auth) {
      console.log('You are already logged out.'); // eslint-disable-line
      return;
    }
    const logout = () => {
      try {
        // TODO Once we start using refresh tokens we also need to implement an API endpoint
        // that invalidate a refresh token in Auth0 (using the Auth0 Management API).
        // This endpoint should be called when the user runs `serverless logout` in the CLI.
        config.set('auth', null);
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
