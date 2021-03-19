'use strict';

module.exports = new Map([
  ...require('./no-service'),
  ...require('./service'),
  ...require('./aws-service'),
]);
