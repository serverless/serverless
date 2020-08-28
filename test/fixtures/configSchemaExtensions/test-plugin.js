'use strict';

class TestPlugin {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      function: {
        properties: {
          handler: { type: 'string' },
        },
      },
    });

    serverless.configSchemaHandler.defineCustomProperties({
      properties: {
        someCustomStringProp: { type: 'string' },
      },
      required: ['someCustomStringProp'],
    });

    serverless.configSchemaHandler.defineFunctionEvent('someProvider', 'someEvent', {
      type: 'object',
      properties: {
        someRequiredStringProp: { type: 'string' },
        someNumberProp: { type: 'number' },
      },
      required: ['someRequiredStringProp'],
      additionalProperties: false,
    });

    serverless.configSchemaHandler.defineTopLevelProperty('top', {
      type: 'string',
    });
  }
}

module.exports = TestPlugin;
