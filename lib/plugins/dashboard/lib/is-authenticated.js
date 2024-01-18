'use strict';

const configUtils = require('@serverless/utils/config');

module.exports = () => Boolean(configUtils.getLoggedInUser() || process.env.SERVERLESS_ACCESS_KEY);
