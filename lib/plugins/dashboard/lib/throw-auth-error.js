'use strict';

module.exports = (serverless) => {
  const errorMessage = process.env.CI
    ? 'You are not currently logged in. Follow instructions in http://slss.io/run-in-cicd to setup env vars for authentication.'
    : 'You are not currently logged in. To log in, use: $ serverless login';
  throw new serverless.classes.Error(errorMessage, 'DASHBOARD_LOGGED_OUT');
};
