'use strict';

class TestPluginWithCollidingFunctionEventPropertyError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      functionEvents: {
        existingEvent: {
          type: 'object',
          properties: { existingProp: { type: 'string' } },
        },
      },
    });

    serverless.configSchemaHandler.defineFunctionEventProperties('someProvider', 'existingEvent', {
      properties: {
        existingProp: { type: 'string' },
      },
    });
  }
}

module.exports = TestPluginWithCollidingFunctionEventPropertyError;
