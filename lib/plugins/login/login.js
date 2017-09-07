'use strict';

const BbPromise = require('bluebird');
// TODO remove readline from the packages
// const readline = require('readline');
const jwtDecode = require('jwt-decode');
const chalk = require('chalk');
const gql = require('graphql-tag');
const uuid = require('uuid');
const has = require('lodash/has');
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
    let fetchTries = 0;

    this.serverless.cli.log('Opening browser...');

    // pop open default browser
    openBrowser(`${config.PLATFORM_FRONTEND_BASE_URL}/login?cli=v1&loginId=${cliLoginId}`);

    const fetchCliLogin = () => {
      fetchTries += 1;
      // indicating the user after a while that the CLI is still waiting
      if (fetchTries >= 60) {
        this.serverless.cli.log('Waiting for a successful authentication in the browser.');
        fetchTries = 0;
      }
      getCliLoginById(cliLoginId)
        .then(response => {
          console.log(response);
          if (!has(response, ['cliLoginById', 'token']) || response.cliLoginById.token === null) {
            // delay the requests for a bit
            setTimeout(() => fetchCliLogin(), 500);
          } else {
            const idToken = response.cliLoginById.token;
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
              // TODO identify if we need access_token and refresh_token as in the old sign in flow
              auth: {
                id_token: idToken,
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
  }
}

module.exports = Login;
