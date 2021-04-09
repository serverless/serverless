'use strict';

class TestPluginWithCollidingFunctionEventError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      function: {
        properties: {
          handler: { type: 'string' },
        },
      },
      functionEvents: {
        existingEvent: {
          type: 'object',
          properties: { existingProp: { type: 'string' } },
        },
      },
    });

    serverless.configSchemaHandler.defineFunctionEvent('someProvider', 'existingEvent', {
      type: 'object',
      properties: {
        someProperty: { type: 'string' },
      },
      required: ['someProperty'],
      additionalProperties: false,
    });
  }
}

module.exports = TestPluginWithCollidingFunctionEventError;
