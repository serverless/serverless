module.exports = {
  parserOptions: {
    ecmaVersion: 2017,
  },
  rules: {
    // console.info allowed to report on long going tasks or valuable debug information
    'no-console': ['error', { allow: ['info'] }],
  },
};
