'use strict';

class TestPluginWithNonExistingEventError {
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

    serverless.configSchemaHandler.defineFunctionEventProperties(
      'someProvider',
      'nonExistingEvent',
      {
        properties: {
          someProperty: { type: 'string' },
        },
      }
    );
  }
}

module.exports = TestPluginWithNonExistingEventError;
