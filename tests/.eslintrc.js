module.exports = {
  parserOptions: {
    ecmaVersion: 2017,
  },
  rules: {
    // console.info allowed to report on long going tasks or valuable debug information
    'no-console': ['error', { allow: ['info'] }],
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
