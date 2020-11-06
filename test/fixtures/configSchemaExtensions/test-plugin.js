'use strict';

class TestPlugin {
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

    serverless.configSchemaHandler.defineFunctionEventProperties('someProvider', 'existingEvent', {
      properties: {
        somePluginAdditionalHttpEventProp: { type: 'string' },
      },
      required: ['somePluginAdditionalHttpEventProp'],
    });

    serverless.configSchemaHandler.defineFunctionProperties('someProvider', {
      properties: {
        someFunctionStringProp: { type: 'string' },
        someRequiredFunctionNumberProp: { type: 'number' },
      },
      required: ['someRequiredFunctionNumberProp'],
    });

    serverless.configSchemaHandler.defineTopLevelProperty('top', {
      type: 'string',
    });
  }
}

module.exports = TestPlugin;
