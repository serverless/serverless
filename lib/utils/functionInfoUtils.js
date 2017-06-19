'use strict';

module.exports = {
  aws: {
    getMemorySize: (functionKey, serverless) =>
      Number(serverless.service.functions[functionKey].memorySize) ||
      Number(serverless.service.provider.memorySize) ||
      1024,
    getTimeout: (functionKey, serverless) =>
      Number(serverless.service.functions[functionKey].timeout) ||
      Number(serverless.service.provider.timeout) ||
      6,
    getRuntime: (functionKey, serverless) =>
      serverless.service.functions[functionKey].runtime ||
      serverless.service.provider.runtime ||
      'nodejs4.3',
    getArnName: (functionKey, serverless) =>
      serverless.service.functions[functionKey].name ||
      `${serverless.service.service}-${serverless.service.provider.stage}-${functionKey}`,
    getEndpoints: (functionKey, serverless, endpoint) => {
      const func = serverless.service.functions[functionKey];
      if (func.events) {
        return func.events.filter(event => event.http).map(event => {
          let method;
          let path;

          if (typeof event.http === 'object') {
            method = event.http.method.toUpperCase();
            path = event.http.path;
          } else {
            method = event.http.split(' ')[0].toUpperCase();
            path = event.http.split(' ')[1];
          }
          path = path !== '/' ? `/${path.split('/').filter(p => p !== '').join('/')}` : '';

          return {
            url: `${endpoint}${path}`,
            method,
          };
        });
      }
      return [];
    },
  },
};
