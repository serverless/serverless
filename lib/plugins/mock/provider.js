'use strict';

const constants = {
  providerName: 'mock',
};

class Provider {
  static getProviderName() {
    return constants.providerName;
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this; // only load plugin in a Google service context
    this.serverless.setProvider(constants.providerName, this);

    this.sdk = {};
  }

  request() {
    // grab necessary stuff from arguments array
    const lastArg = arguments[Object.keys(arguments).pop()]; //eslint-disable-line
    const hasParams = (typeof lastArg === 'object');
    const filArgs = arguments.filter(v => typeof v === 'string'); //eslint-disable-line
    const params = hasParams ? lastArg : {};

    return params;
  }
}

module.exports = Provider;
