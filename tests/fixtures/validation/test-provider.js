'use strict';

class TestProviderPlugin {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('test', {
      provider: { additionalProperties: true },
      function: {
        properties: { handler: { type: 'string' } },
        additionalProperties: true,
      },
    });
  }
}

module.exports = TestProviderPlugin;
