'use strict';

const fdk = require('@serverless/fdk');
const getConfigureConfig = require('./getConfigureConfig');

function registerFunctionsToEventGateway(service,
                                         eventsRootUrl,
                                         configurationRootUrl,
                                         localEmulatorRootUrl) {
  const gateway = fdk.eventGateway({
    url: eventsRootUrl,
    configurationUrl: configurationRootUrl,
  });

  const configureConfig = getConfigureConfig(service, localEmulatorRootUrl);
  return gateway.configure(configureConfig);
}

module.exports = registerFunctionsToEventGateway;
