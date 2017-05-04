'use strict';

const BbPromise = require('bluebird');
const crypto = require('crypto');
const readline = require('readline');
const opn = require('opn');
const fetch = require('node-fetch');
const jwtDecode = require('jwt-decode');
const chalk = require('chalk');
const getFrameworkId = require('../../utils/getFrameworkId');
const updateConfig = require('../../utils/config/update');

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
        usage: 'Login to your Serverless platform account',
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
    const authorizeUrl =
       `${config.AUTH0_URL}/authorize?response_type=code&scope=openid%20email%20nickname&` +
       `client_id=${config.AUTH0_CLIENT_ID}&redirect_uri=${config.AUTH0_CALLBACK_URL}` +
       `&code_challenge=${verifierChallenge}&code_challenge_method=S256&state=${frameworkId}`;

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
            this.serverless.cli.log('You are logged in');
            // alias for segment

            // update .serverlessrc
            const rc = {
              frameworkId,
              userId: decoded.sub,
              auth: platformResponse,
            };

            updateConfig(rc);
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
