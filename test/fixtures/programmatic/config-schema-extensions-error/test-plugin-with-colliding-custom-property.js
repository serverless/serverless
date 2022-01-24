'use strict';

class TestPluginWithCollidingCustomPropertyError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineCustomProperties({
      properties: {
        someProperty: { type: 'string' },
      },
      required: ['someProperty'],
    });

    serverless.configSchemaHandler.defineCustomProperties({
      properties: {
        someProperty: { type: 'string' },
      },
      required: ['someProperty'],
    });
  }
}

module.exports = TestPluginWithCollidingCustomPropertyError;
