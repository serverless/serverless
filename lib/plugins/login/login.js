'use strict';

const BbPromise = require('bluebird');
// TODO remove readline from the packages
// const readline = require('readline');
const jwtDecode = require('jwt-decode');
const chalk = require('chalk');
const gql = require('graphql-tag');
const uuid = require('uuid');
const has = require('lodash/has');
const forge = require('node-forge');
// const crypto = require('crypto');
const querystring = require('querystring');
const openBrowser = require('../../utils/openBrowser');
const configUtils = require('../../utils/config');
const clearConsole = require('../../utils/clearConsole');
const userStats = require('../../utils/userStats');
const setConfig = require('../../utils/config').set;
const createApolloClient = require('../../utils/createApolloClient');

const config = {
  // TODO use a global config that is shared between platform and login
  // PLATFORM_FRONTEND_BASE_URL: 'https://platform.serverless-dev.com/',
  PLATFORM_FRONTEND_BASE_URL: 'http://localhost:3000',
  // GRAPHQL_ENDPOINT_URL: 'https://graphql.serverless-dev.com/graphql',
  GRAPHQL_ENDPOINT_URL: 'http://localhost:3000/graphql',
};

const client = createApolloClient(config.GRAPHQL_ENDPOINT_URL);

const getCliLoginById = id =>
  client
    .query({
      fetchPolicy: 'network-only',
      query: gql`
        query cliLoginById($id: String!) {
          cliLoginById(id: $id) {
            encryptedAccessToken
            encryptedIdToken
            encryptedRefreshToken
            encryptedKey
            encryptedIv
          }
        }
      `,
      variables: { id },
    })
    .then(response => response.data);

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
          'Sorry, failed intiating the authentication key. Please contact the Serverless team.'
        );
        throw generateKeyErr;
      }
      const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
      const encodedPublicKeyPem = forge.util.encode64(publicKeyPem);
      // const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);

      this.serverless.cli.log('Opening browser...');

      // Avoid camel casing since queries is going into to be part of the URL
      const queries = querystring.stringify({
        cli: 'v1',
        'login-id': cliLoginId,
        'public-key': encodedPublicKeyPem,
      });
      // open default browser
      openBrowser(`${config.PLATFORM_FRONTEND_BASE_URL}/login?${queries}`);

      const fetchCliLogin = () => {
        fetchTries += 1;
        // indicating the user after a while that the CLI is still waiting
        if (fetchTries >= 60) {
          this.serverless.cli.log('Waiting for a successful authentication in the browser.');
          fetchTries = 0;
        }
        getCliLoginById(cliLoginId)
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

              // // NOTE instead of node-forge we used crypto here since it's more trustworthy,
              // // but doesn't depend on OpenSSL being installed
              // const key = crypto
              //   .privateDecrypt(
              //     privateKeyPem,
              //     Buffer.from(forge.util.decode64(response.cliLoginById.encryptedKey))
              //   )
              //   .toString();
              //
              // // NOTE instead of node-forge we used crypto here since it's more trustworthy,
              // // but doesn't depend on OpenSSL being installed
              // const iv = crypto
              //   .privateDecrypt(
              //     privateKeyPem,
              //     Buffer.from(forge.util.decode64(response.cliLoginById.encryptedIv))
              //   )
              //   .toString();

              const decipherIdToken = forge.cipher.createDecipher('AES-CBC', key);
              decipherIdToken.start({ iv });
              decipherIdToken.update(
                forge.util.createBuffer(forge.util.decode64(response.cliLoginById.encryptedIdToken))
              );
              const resultIdToken = decipherIdToken.finish(); // check 'result' for true/false
              const idToken = decipherIdToken.output.toString();

              const decipherAccessToken = forge.cipher.createDecipher('AES-CBC', key);
              decipherAccessToken.start({ iv });
              decipherAccessToken.update(
                forge.util.createBuffer(
                  forge.util.decode64(response.cliLoginById.encryptedAccessToken)
                )
              );
              const resultAccessToken = decipherAccessToken.finish(); // check 'result' for true/false
              const accessToken = decipherAccessToken.output.toString();

              const decipherRefreshToken = forge.cipher.createDecipher('AES-CBC', key);
              decipherRefreshToken.start({ iv });
              decipherRefreshToken.update(
                forge.util.createBuffer(
                  forge.util.decode64(response.cliLoginById.encryptedRefreshToken)
                )
              );
              const resultRefreshToken = decipherRefreshToken.finish(); // check 'result' for true/false
              const refreshToken = decipherRefreshToken.output.toString();

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
          .catch(err => {
            console.log(err);
            // TODO throw an error
            this.serverless.cli.consoleLog(
              chalk.red('Sorry, something went. Please run "serverless login" again.')
            );
          });
      };

      fetchCliLogin();
    });
  }
}

module.exports = Login;
