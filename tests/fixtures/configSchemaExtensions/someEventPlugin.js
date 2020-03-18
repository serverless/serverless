'use strict';

class SomeEventPlugin {
  constructor(serverless) {
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
  }
}

module.exports = SomeEventPlugin;
