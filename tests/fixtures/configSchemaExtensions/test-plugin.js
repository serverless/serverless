'use strict';

class TestPlugin {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      provider: {
        properties: {
          stage: { type: 'string' },
          variableSyntax: { type: 'string' },
          versionFunctions: { type: 'boolean' },
          remoteFunctionData: { type: 'null' },
        },
      },
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
