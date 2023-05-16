'use strict';

class TestPluginWithCollidingFunctionEventPropertyError {
  constructor(serverless) {
    serverless.configSchemaHandler.defineProvider('someProvider', {
      function: {
        properties: {
          handler: { type: 'string' },
        },
      },
    });

    serverless.configSchemaHandler.defineFunctionProperties('someProvider', {
      properties: {
        handler: { type: 'string' },
      },
    });
  }
}

module.exports = TestPluginWithCollidingFunctionEventPropertyError;
