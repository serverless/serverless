'use strict';

module.exports.handler = async () => {
  const serverless = require('./serverless.yml');
  const serviceConfig = serverless.service;

  if (!serviceConfig.package || !serviceConfig.package.individually) {
    // eslint-disable-next-line no-console
    console.warn("Warning: 'individually: true' is not set at the service level.");
  }
};
