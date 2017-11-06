'use strict';

const _ = require('lodash');

module.exports = {
  deleteNullEnvVars() {
    const providerEnv = this.serverless.service.provider.environment;
    if (providerEnv) {
      this.serverless.service.provider.environment = _.omitBy(providerEnv, _.isNull);
    }
    for (const funcName of Object.keys(this.serverless.service.functions)) {
      const env = this.serverless.service.functions[funcName].environment;
      if (env) {
        this.serverless.service.functions[funcName].environment = _.omitBy(env, _.isNull);
      }
    }
  },
};
