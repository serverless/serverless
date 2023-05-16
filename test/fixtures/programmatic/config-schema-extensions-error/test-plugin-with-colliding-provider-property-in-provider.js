'use strict';

class TestPluginWithCollidingProviderPropertyInProviderError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      provider: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
    });
  }
}

module.exports = TestPluginWithCollidingProviderPropertyInProviderError;
