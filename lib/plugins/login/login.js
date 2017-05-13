'use strict';

const BbPromise = require('bluebird');
const crypto = require('crypto');
const readline = require('readline');
const opn = require('opn');
const fetch = require('node-fetch');
const jwtDecode = require('jwt-decode');
const chalk = require('chalk');
const getFrameworkId = require('../../utils/getFrameworkId');
const segment = require('../../utils/segment')
const setConfig = require('../../utils/config').set;

const config = {
  AUTH0_CLIENT_ID: 'iiEYK0KB30gj94mjB8HP9lhhTgae0Rg3',
  AUTH0_URL: 'https://serverlessinc.auth0.com',
  AUTH0_CALLBACK_URL: 'https://serverless.com/welcome',
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
  openBrowser(url) {
    let browser = process.env.BROWSER;
    if (browser === 'none') {
      return false;
    }
    if (process.platform === 'darwin' && browser === 'open') {
      browser = undefined;
    }
    try {
      const options = { app: browser };
      opn(url, options).catch(() => {});
      return true;
    } catch (err) {
      console.log('---------------------------'); // eslint-disable-line
      console.log(`🙈  ${chalk.red("Unable to open browser automatically")}`); // eslint-disable-line
      console.log(chalk.green("Please open your browser & open the URL below to login:")); // eslint-disable-line
      console.log(chalk.yellow(url)); // eslint-disable-line
      console.log('---------------------------'); // eslint-disable-line
      return false;
    }
  }
  login() {
    this.serverless.cli.log('The Serverless login will open in your default browser...');

    // Generate the verifier, and the corresponding challenge
    const verifier = base64url(crypto.randomBytes(32));
    const verifierChallenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const frameworkId = getFrameworkId();
    // eslint-disable-next-line prefer-template
    const state = `id%3D${frameworkId}`;
    // refresh token docs https://auth0.com/docs/tokens/preview/refresh-token#get-a-refresh-token
    const authorizeUrl =
       `${config.AUTH0_URL}/authorize?response_type=code&scope=openid%20email%20nickname%20offline_access&` +
       `client_id=${config.AUTH0_CLIENT_ID}&redirect_uri=${config.AUTH0_CALLBACK_URL}` +
       `&code_challenge=${verifierChallenge}&code_challenge_method=S256&state=${state}`;

    setTimeout(() => {
      this.serverless.cli.log('Opening browser...');
    }, 300);

    setTimeout(() => {
      // pop open default browser
      this.openBrowser(authorizeUrl);

      // wait for token
      const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      // o get an access token and a refresh token from that code you need to call the oauth/token endpoint. Here's more info - https://auth0.com/docs/protocols#3-getting-the-access-token
      readlineInterface.question('Please enter the authorization code here: ', (code) => {
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
            // console.log('data', platformResponse);
            const decoded = jwtDecode(platformResponse.id_token);
            // console.log(decoded)
            this.serverless.cli.log('You are logged in');
            // alias for segment
            // segment.alias({
            //   previousId: frameworkId,
            //   userId: decoded.sub,
            // });
            /* analytics.identify({
              userId: decoded.sub,
              traits: {
                email: profile.email,
              },
            }) */
            // update .serverlessrc
            const userConfig = {
              userId: decoded.sub,
              frameworkId,
              users: {},
            };
            // set user auth
            userConfig.users[decoded.sub] = {
              userId: decoded.sub,
              auth: platformResponse,
            };
            setConfig(userConfig);
            process.exit(0);
          })
          .catch((e) => {
            console.log(e); // eslint-disable-line
            process.exit(0);
          });
      });
    }, 2000);
  }
}

module.exports = Login;
