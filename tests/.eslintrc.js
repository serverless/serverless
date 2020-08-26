'use strict';

module.exports = {
  parserOptions: {
    ecmaVersion: 2017,
  },
  overrides: [
    {
      files: ['utils/**.js'],
      parserOptions: {
        ecmaVersion: 2015,
      },
    },
    {
      files: ['utils/aws-cleanup.js', 'utils/integration.js'],
      parserOptions: {
        ecmaVersion: 2017,
      },
    },
  ],
};
