'use strict';

const BbPromise = require('bluebird');
const crypto = require('crypto');
const readline = require('readline');
const fetch = require('node-fetch');
const jwtDecode = require('jwt-decode');
const chalk = require('chalk');
const openBrowser = require('../../utils/openBrowser');
const configUtils = require('../../utils/config');
const clearConsole = require('../../utils/clearConsole');
const userStats = require('../../utils/userStats');
const setConfig = require('../../utils/config').set;

const config = {
  AUTH0_CLIENT_ID: 'iiEYK0KB30gj94mjB8HP9lhhTgae0Rg3',
  AUTH0_URL: 'https://serverlessinc.auth0.com',
  AUTH0_CALLBACK_URL: 'https://serverless.com/auth',
};

function base64url(url) {
  return url.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

class Login {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      login: {
        usage: 'Login or sign up for the Serverless Platform',
        lifecycleEvents: [
          'login',
        ],
      },
    };

    this.hooks = {
      'login:login': () => BbPromise.bind(this).then(this.login),
    };
  }
  login() {
    clearConsole();
    this.serverless.cli.log('The Serverless login will open in your default browser...');
    // Generate the verifier, and the corresponding challenge
    const verifier = base64url(crypto.randomBytes(32));
    const verifierChallenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const configuration = configUtils.getConfig();
    const frameworkId = configuration.frameworkId;
    // eslint-disable-next-line prefer-template
    const version = this.serverless.version;
    const state = `id%3D${frameworkId}%26version%3D${version}%26platform%3D${process.platform}`;
    // refresh token docs https://auth0.com/docs/tokens/preview/refresh-token#get-a-refresh-token
    const scope = 'openid%20nickname%20email%20name%20login_count%20created_at%20tracking_id%20offline_access'; // eslint-disable-line
    const authorizeUrl =
       `${config.AUTH0_URL}/authorize?response_type=code&scope=${scope}` +
       `&client_id=${config.AUTH0_CLIENT_ID}&redirect_uri=${config.AUTH0_CALLBACK_URL}` +
       `&code_challenge=${verifierChallenge}&code_challenge_method=S256&state=${state}`;

    setTimeout(() => {
      this.serverless.cli.log('Opening browser...');
    }, 300);

    setTimeout(() => {
      // pop open default browser
      openBrowser(authorizeUrl);

      // wait for token
      const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      // o get an access token and a refresh token from that code you need to call the oauth/token endpoint. Here's more info - https://auth0.com/docs/protocols#3-getting-the-access-token
      readlineInterface.question('Please enter the verification code here: ', (code) => {
        const authorizationData = {
          code,
          code_verifier: verifier,
          client_id: config.AUTH0_CLIENT_ID,
          grant_type: 'authorization_code',
          redirect_uri: config.AUTH0_CALLBACK_URL,
        };
        // verify login
        fetch(`${config.AUTH0_URL}/oauth/token`, {
          method: 'POST',
          body: JSON.stringify(authorizationData),
          headers: { 'content-type': 'application/json' },
        })
          .then((response) => response.json())
          .then((platformResponse) => {
            const decoded = jwtDecode(platformResponse.id_token);
            this.serverless.cli.log('You are now logged in');
            // because platform only support github
            const id = decoded.tracking_id || decoded.sub;

            /* For future use
            segment.identify({
              userId: id,
              traits: {
                email: profile.email,
              },
            }) */

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
              auth: platformResponse,
            };

            // update .serverlessrc
            setConfig(userConfig);

            const userID = new Buffer(id).toString('base64');
            const email = new Buffer(decoded.email).toString('base64');
            const name = new Buffer(decoded.name).toString('base64');
            const loginCount = decoded.login_count;
            const createdAt = decoded.created_at;
            const successUrl = `https://serverless.com/success?u=${userID}&e=${email}&n=${name}&c=${loginCount}&v=${version}&d=${createdAt}&id=${frameworkId}`; // eslint-disable-line

            openBrowser(successUrl);
            // identify user for better onboarding
            userStats.identify({
              id,
              frameworkId,
              email: decoded.email,
              // unix timestamp
              created_at: Math.round(+new Date(createdAt) / 1000),
              trackingDisabled: configuration.trackingDisabled,
              force: true,
            }).then(() => {
              userStats.track('user_loggedIn', {
                id,
                email: decoded.email,
                force: true,
              }).then(() => {
                // then exit process
                process.exit(0);
              });
            });
          })
          .catch(() => {
            this.serverless.cli.consoleLog(
              chalk.red('Incorrect token value supplied. Please run "serverless login" again'));
            process.exit(0);
          });
      });
    }, 2000);
  }
}

module.exports = Login;
