'use strict';

class TestPluginWithComplexEventWithoutObjectDefinitionError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      function: {
        properties: {
          handler: { type: 'string' },
        },
      },
      functionEvents: {
        existingComplexEvent: {
          anyOf: [{ type: 'string' }, { type: 'integer' }],
        },
      },
    });

    serverless.configSchemaHandler.defineFunctionEventProperties(
      'someProvider',
      'existingComplexEvent',
      {
        properties: {
          someProperty: { type: 'string' },
        },
      }
    );
  }
}

module.exports = TestPluginWithComplexEventWithoutObjectDefinitionError;
