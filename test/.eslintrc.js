'use strict';

module.exports = {
  parserOptions: {
    ecmaVersion: 2017,
  },
  overrides: [
    {
      files: ['utils/**'],
      parserOptions: {
        ecmaVersion: 2015,
      },
    },
    {
      files: ['utils/awsCleanup.js', 'utils/integration.js'],
      parserOptions: {
        ecmaVersion: 2017,
      },
    },
  ],
};
