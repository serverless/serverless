'use strict';

class SomeEventPlugin {
  constructor(serverless) {
    serverless.configSchemaHandler.defineCustomProperty('someCustomStringProp', { type: 'string' });

    serverless.configSchemaHandler.defineFunctionEvent('someEvent', {
      type: 'object',
      properties: {
        someStringProp: { type: 'string' },
        someNumberProp: { type: 'number' },
      },
    });
  }
}

module.exports = SomeEventPlugin;
