'use strict';

module.exports = {
  rules: {
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 72],
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 72],
    'header-max-length': [2, 'always', 72],
    'scope-case': [2, 'always', 'start-case'],
    'scope-enum': [
      2,
      'always',
      ['', 'AWS APIGW', 'AWS Lambda', 'CLI', 'Plugins', 'Standalone', 'User Config', 'Variables'],
    ],
    'subject-case': [2, 'always', 'sentence-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'type-enum': [
      2,
      'always',
      ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'style', 'test'],
    ],
  },
};
