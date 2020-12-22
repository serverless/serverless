'use strict';

class TestPluginWithCollidingProviderPropertyInFunctionError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      function: {
        type: 'object',
        properties: {
          events: { type: 'string' },
        },
      },
    });
  }
}

module.exports = TestPluginWithCollidingProviderPropertyInFunctionError;
