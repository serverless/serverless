import type { AWS } from '@serverless/typescript';

import hello from '@functions/hello';
import { logger } from '@libs/logger';

const serverlessConfiguration: AWS = {
  service: 'aws-nodejs-typescript',
  frameworkVersion: '2',
  custom: {
    webpack: {
      webpackConfig: './webpack.config.js',
      includeModules: true,
    },
  },
  plugins: ['serverless-webpack'],
  provider: {
    name: 'aws',
    runtime: 'nodejs14.x',
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
    },
    lambdaHashingVersion: '20201221',
  },
  // import the function via paths
  functions: { hello },
};

// use an import only available via tsconfig-paths
logger(JSON.stringify(serverlessConfiguration, null, 2));

module.exports = serverlessConfiguration;
