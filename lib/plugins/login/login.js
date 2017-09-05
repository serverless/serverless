'use strict';

const BbPromise = require('bluebird');
const crypto = require('crypto');
const readline = require('readline');
const fetch = require('node-fetch');
const jwtDecode = require('jwt-decode');
const chalk = require('chalk');
const gql = require('graphql-tag');
const uuid = require('uuid');
const openBrowser = require('../../utils/openBrowser');
const configUtils = require('../../utils/config');
const clearConsole = require('../../utils/clearConsole');
const userStats = require('../../utils/userStats');
const setConfig = require('../../utils/config').set;
const createApolloClient = require('../../utils/createApolloClient');

const config = {
  // TODO use a global config that is shared between platform and login
  PLATFORM_FRONTEND_BASE_URL: 'https://platform.serverless.com/',
  GRAPHQL_ENDPOINT_URL: 'https://graphql.serverless.com/graphql',
};

const client = createApolloClient(config.GRAPHQL_ENDPOINT_URL);

const getCliLoginById = id =>
  client
    .query({
      query: gql`
        query getCliLoginById($id: String!) {
          getCliLoginById(id: $id) {
            token
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

    let secondsPassed = 0;
    // TODO cleanup interval
    setInterval(() => {
      getCliLoginById(cliLoginId)
        .then(({ token }) => {
          const decoded = jwtDecode(token);
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
            // TODO identify if we need access_token and refresh_token as in the old sign in flow
            auth: {
              id_token: token,
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
        })
        .catch(() => {
          this.serverless.cli.consoleLog(
            chalk.red('Incorrect token value supplied. Please run "serverless login" again')
          );
          process.exit(0);
        });
      secondsPassed += 1;
      if (secondsPassed >= 20000) {
        this.serverless.cli.log('Waiting for your authentication in the browser.');
        secondsPassed = 0;
      }
    }, 1000);

    this.serverless.cli.log('Opening browser...');

    // pop open default browser
    openBrowser('$PLATFORM_FRONTEND_BASE_URL/login?cli=true');
  }
}

module.exports = Login;
