import { functions } from '@functions/config';

const serverlessConfiguration = {
  service: 'gcf-nodejs-typescript-template', // NOTE: Don't put the word "google" in here
  frameworkVersion: '3',
  custom: {
    webpack: {
      webpackConfig: './webpack.config.js',
      includeModules: true,
    },
  },
  plugins: ['serverless-google-cloudfunctions', 'serverless-webpack'],
  provider: {
    name: 'google',
    runtime: 'nodejs14',
    region: 'europe-west1',
    project: '<your-gcp-project-id>',
  },
  functions,
};

module.exports = serverlessConfiguration;
