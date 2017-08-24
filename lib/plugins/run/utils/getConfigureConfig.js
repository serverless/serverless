'use strict';

const _ = require('lodash');
const getFunctionToRegister = require('./getFunctionToRegister');

function getConfigureConfig(serviceObject, localEmulatorRootUrl) {
  const config = {
    functions: [],
    subscriptions: [],
  };
  _.each(serviceObject.functions, (functionConfig, functionName) => {
    let functionSubscriptions = [];
    const functionToRegister = getFunctionToRegister(serviceObject.service,
      functionName, localEmulatorRootUrl);

    if (functionConfig.events && functionConfig.events.length > 0) {
      functionSubscriptions = _.map(functionConfig.events, (event) => {
        const functionSubscription = {
          functionId: functionToRegister.functionId,
        };

        if (typeof event === 'string') {
          functionSubscription.event = event;
        } else if (typeof event === 'object' && event.http) {
          functionSubscription.event = 'http';
          functionSubscription.method = event.http.method;
          functionSubscription.path = event.http.path;
        }

        return functionSubscription;
      });
    }

    config.functions.push(functionToRegister);
    config.subscriptions = config.subscriptions.concat(functionSubscriptions);
  });
  return config;
}

module.exports = getConfigureConfig;
