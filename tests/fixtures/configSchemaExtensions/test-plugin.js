'use strict';

class TestPlugin {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      provider: { additionalProperties: true },
      function: {
        properties: { handler: { type: 'string' } },
        additionalProperties: true,
      },
    });

    serverless.configSchemaHandler.defineCustomProperty('someCustomStringProp', { type: 'string' });

    serverless.configSchemaHandler.defineFunctionEvent('someEvent', {
      type: 'object',
      properties: {
        someRequiredStringProp: { type: 'string' },
        someNumberProp: { type: 'number' },
      },
      required: ['someRequiredStringProp'],
      additionalProperties: false,
    });

    serverless.configSchemaHandler.defineTopLevelProperty('app', {
      type: 'string',
    });
  }
}

module.exports = TestPlugin;
