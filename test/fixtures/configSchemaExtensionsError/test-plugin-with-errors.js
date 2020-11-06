'use strict';

class TestPluginWithErrors {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      function: {
        properties: {
          handler: { type: 'string' },
          events: {
            type: 'array',
            items: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    existingEvent: {
                      type: 'object',
                      properties: { existingProp: { type: 'string' } },
                    },
                  },
                  required: ['existingEvent'],
                },
              ],
            },
          },
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

module.exports = TestPluginWithErrors;
