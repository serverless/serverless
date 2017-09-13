'use strict';

const BbPromise = require('bluebird');
const jwtDecode = require('jwt-decode');
const chalk = require('chalk');
const uuid = require('uuid');
const has = require('lodash/has');
const forge = require('node-forge');
const querystring = require('querystring');
const openBrowser = require('../../utils/openBrowser');
const configUtils = require('../../utils/config');
const clearConsole = require('../../utils/clearConsole');
const userStats = require('../../utils/userStats');
const setConfig = require('../../utils/config').set;
const createApolloClient = require('../../utils/createApolloClient');
const decryptToken = require('./lib/decryptToken');
const getCliLoginById = require('./lib/getCliLoginById');

const config = {
  PLATFORM_FRONTEND_BASE_URL: 'https://platform.serverless.com/',
  GRAPHQL_ENDPOINT_URL: 'https://graphql.serverless.com/graphql',
};

const client = createApolloClient(config.GRAPHQL_ENDPOINT_URL);

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
    clearConsole();
    this.serverless.cli.log('The Serverless login will open in your default browser...');
    const configuration = configUtils.getConfig();
    const frameworkId = configuration.frameworkId;
    const cliLoginId = uuid.v4();
    let fetchTries = 0;

    forge.pki.rsa.generateKeyPair({ bits: 2048 }, (generateKeyErr, keypair) => {
      if (generateKeyErr) {
        this.serverless.cli.log(
          'Sorry, failed initiating the authentication key. ',
          'Please contact the Serverless team at hello@serverless.com'
        );
        throw generateKeyErr;
      }
      const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
      const encodedPublicKeyPem = forge.util.encode64(publicKeyPem);

      this.serverless.cli.log('Opening browser...');

      // Avoid camel casing since queries is going into to be part of the URL
      const queries = querystring.stringify({
        cli: 'v1',
        'login-id': cliLoginId,
        'public-key': encodedPublicKeyPem,
      });
      // open default browser
      openBrowser(`${config.PLATFORM_FRONTEND_BASE_URL}login?${queries}`);

      const fetchCliLogin = () => {
        fetchTries += 1;
        // indicating the user after a while that the CLI is still waiting
        if (fetchTries >= 60) {
          this.serverless.cli.log('Waiting for a successful authentication in the browser.');
          fetchTries = 0;
        }
        getCliLoginById(cliLoginId, client.query)
          .then(response => {
            const hasAllToken =
              has(response, ['cliLoginById', 'encryptedAccessToken']) &&
              has(response, ['cliLoginById', 'encryptedIdToken']) &&
              has(response, ['cliLoginById', 'encryptedRefreshToken']) &&
              has(response, ['cliLoginById', 'encryptedKey']) &&
              has(response, ['cliLoginById', 'encryptedIv']) &&
              response.cliLoginById.encryptedAccessToken !== null &&
              response.cliLoginById.encryptedIdToken !== null &&
              response.cliLoginById.encryptedRefreshToken !== null &&
              response.cliLoginById.encryptedKey !== null &&
              response.cliLoginById.encryptedIv !== null;
            if (!hasAllToken) {
              // delay the requests for a bit
              setTimeout(() => fetchCliLogin(), 500);
            } else {
              const key = keypair.privateKey.decrypt(
                forge.util.decode64(response.cliLoginById.encryptedKey),
                'RSA-OAEP'
              );
              const iv = keypair.privateKey.decrypt(
                forge.util.decode64(response.cliLoginById.encryptedIv),
                'RSA-OAEP'
              );

              const idToken = decryptToken(response.cliLoginById.encryptedIdToken, key, iv);
              const accessToken = decryptToken(response.cliLoginById.encryptedAccessToken, key, iv);
              const refreshToken = decryptToken(
                response.cliLoginById.encryptedRefreshToken,
                key,
                iv
              );

              const decoded = jwtDecode(idToken);
              this.serverless.cli.log('You are now logged in');
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
                auth: {
                  id_token: idToken,
                  access_token: accessToken,
                  refresh_token: refreshToken,
                },
              };

              // update .serverlessrc
              setConfig(userConfig);

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
                    })
                    .then(() => {
                      // then exit process
                      process.exit(0);
                    });
                });
            }
          })
          .catch(() => {
            this.serverless.cli.consoleLog(
              chalk.red('Sorry, something went wrong. Please run "serverless login" again.')
            );
            throw new this.serverless.classes.Error(
              'Failed to login due to an error. Please try again or contact hello@serverless.com'
            );
          });
      };

      fetchCliLogin();
    });
  }
}

module.exports = Login;
