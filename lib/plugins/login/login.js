'use strict';

const BbPromise = require('bluebird');
const jwtDecode = require('jwt-decode');
const platform = require('@serverless/platform-sdk');
const configUtils = require('../../utils/config');
const userStats = require('../../utils/userStats');

class Login {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      login: {
        usage: 'Login or sign up for the Serverless Platform',
        lifecycleEvents: ['login'],
        platform: true,
      },
    };

    this.hooks = {
      'login:login': () => BbPromise.bind(this).then(this.login),
    };
  }
  login() {
    this.serverless.cli.log('The Serverless login will open in your default browser...');
    const configuration = configUtils.getConfig();
    const frameworkId = configuration.frameworkId;

    return platform.login().then(data => {
      const decoded = jwtDecode(data.idToken);
      // because platform only support github
      const id = decoded.tracking_id || decoded.sub;
      const userConfig = {
        userId: id,
        frameworkId,
        users: {},
      };
      // set user auth in global .serverlessrc file
      userConfig.users[id] = {
        userId: id,
        name: decoded.name,
        email: decoded.email,
        username: data.username,
        dashboard: data,
      };

      // update .serverlessrc
      configUtils.set(userConfig);

      // identify user for better onboarding
      userStats
        .identify({
          id,
          frameworkId,
          email: decoded.email,
          // unix timestamp
          created_at: Math.round(+new Date(decoded.createdAt) / 1000),
          trackingDisabled: configuration.trackingDisabled,
          force: true,
        })
        .then(() => {
          userStats
            .track('user_loggedIn', {
              id,
              email: decoded.email,
              force: true,
            });
        });
      this.serverless.cli.log('You are now logged in');
      process.exit(0);
    });
  }
}

module.exports = Login;
