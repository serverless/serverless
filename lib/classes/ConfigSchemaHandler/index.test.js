'use strict';

const chai = require('chai');
const runServerless = require('../../../test/utils/run-serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;
const FUNCTION_NAME_PATTERN = '^[a-zA-Z0-9-_]+$';

describe('ConfigSchemaHandler', () => {
  describe('#constructor', () => {
    it('should freeze parts of schema for service', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        expect(() => {
          serverless.configSchemaHandler.schema.properties.service.name = 'changed';
        }).to.throw(Error);
      });
    });

    it('should freeze parts of schema for plugins', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        expect(() => {
          serverless.configSchemaHandler.schema.properties.plugins.properties = 'changed';
        }).to.throw(Error);
      });
    });

    it('should freeze parts of schema for resources', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        expect(() => {
          serverless.configSchemaHandler.schema.properties.resources.something = 'changed';
        }).to.throw(Error);
      });
    });

    it('should freeze parts of schema for package', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        expect(() => {
          serverless.configSchemaHandler.schema.properties.package.properties.oneMore = {
            type: 'string',
          };
        }).to.throw(Error);
      });
    });

    it('should freeze parts of schema for layers', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        expect(() => {
          serverless.configSchemaHandler.schema.properties.layers.properties = 'changed';
        }).to.throw(Error);
      });
    });
  });

  describe('#validateConfig', () => {
    it('should run without errors for valid config', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      });
    });
  });

  describe('#defineFunctionEvent', () => {
    it('should extend schema with defineFunctionEvent method', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        const expectedPieceOfSchema = {
          type: 'object',
          properties: {
            someEvent: {
              type: 'object',
              properties: {
                someRequiredStringProp: { type: 'string' },
                someNumberProp: { type: 'number' },
              },
              required: ['someRequiredStringProp'],
              additionalProperties: false,
            },
          },
          required: ['someEvent'],
          additionalProperties: false,
        };

        expect(
          serverless.serverless.configSchemaHandler.schema.properties.functions.patternProperties[
            FUNCTION_NAME_PATTERN
          ].properties.events.items.anyOf.find(definition => definition.required[0] === 'someEvent')
        ).to.deep.equal(expectedPieceOfSchema);
        return;
      });
    });
  });

  describe('#defineFunctionEventProperties', () => {
    it('should extend schema with defineFunctionEventProperties method', async () => {
      const serverless = await runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      });

      const existingEventDefinition = serverless.serverless.configSchemaHandler.schema.properties.functions.patternProperties[
        FUNCTION_NAME_PATTERN
      ].properties.events.items.anyOf.find(definition => definition.required[0] === 'existingEvent')
        .properties.existingEvent;

      expect(existingEventDefinition.properties).to.have.deep.property(
        'somePluginAdditionalEventProp',
        {
          type: 'string',
        }
      );
      expect(existingEventDefinition.required).to.include('somePluginAdditionalEventProp');
    });

    it('should extend schema with defineFunctionEventProperties method on complexe event schema', async () => {
      const serverless = await runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      });

      const existingEventDefinition = serverless.serverless.configSchemaHandler.schema.properties.functions.patternProperties[
        FUNCTION_NAME_PATTERN
      ].properties.events.items.anyOf.find(
        definition => definition.required[0] === 'existingComplexEvent'
      ).properties.existingComplexEvent;

      expect(existingEventDefinition).to.deep.equal({
        anyOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: {
              existingPropForObjectEventDefinition: { type: 'string' },
              somePluginAdditionalComplexeEventProp: { type: 'string' },
            },
            required: ['somePluginAdditionalComplexeEventProp'],
          },
        ],
      });
    });

    it('should throw when defineFunctionEventProperties is used on non existing event name', async () => {
      await expect(
        runServerless({
          fixture: 'configSchemaExtensionsError',
          cliArgs: ['info'],
          configExt: {
            plugins: ['./test-plugin-with-non-existing-event-error'],
          },
        })
      ).to.eventually.be.rejected.and.have.property('code', 'UNRECOGNIZED_FUNCTION_EVENT_SCHEMA');
    });

    it('should throw when defineFunctionEventProperties is used on event without object definition', async () => {
      await expect(
        runServerless({
          fixture: 'configSchemaExtensionsError',
          cliArgs: ['info'],
          configExt: {
            plugins: ['./test-plugin-with-complex-event-without-object-definition'],
          },
        })
      ).to.eventually.be.rejected.and.have.property('code', 'FUNCTION_EVENT_SCHEMA_NOT_OBJECT');
    });
  });

  describe('#defineFunctionProperties', () => {
    it('should extend schema with defineFunctionProperties method', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        const actualFunctionProperties =
          serverless.serverless.configSchemaHandler.schema.properties.functions.patternProperties[
            FUNCTION_NAME_PATTERN
          ].properties;

        expect(actualFunctionProperties).to.have.deep.property('someFunctionStringProp', {
          type: 'string',
        });

        expect(actualFunctionProperties).to.have.deep.property('someRequiredFunctionNumberProp', {
          type: 'number',
        });

        return;
      });
    });
  });

  describe('#defineCustomProperties', () => {
    it('should extend schema with defineCustomProperties method', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        const someCustomStringProp = {
          type: 'string',
        };
        expect(
          serverless.serverless.configSchemaHandler.schema.properties.custom.properties
            .someCustomStringProp
        ).to.deep.equal(someCustomStringProp);
        return;
      });
    });
  });

  describe('#defineTopLevelProperty', () => {
    it('should extend schema with defineTopLevelProperty method', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        const expectedAppPropSchema = {
          type: 'string',
        };
        expect(serverless.serverless.configSchemaHandler.schema.properties.top).to.deep.equal(
          expectedAppPropSchema
        );
        return;
      });
    });
  });

  describe('#defineProvider', () => {
    it('should extend schema with defineProvider method', () => {
      return runServerless({
        fixture: 'configSchemaExtensions',
        cliArgs: ['info'],
      }).then(serverless => {
        const providerPieceOfSchema = {
          type: 'object',
          properties: {
            name: { const: 'someProvider' },
            stage: { type: 'string' },
            variableSyntax: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        };
        expect(serverless.serverless.configSchemaHandler.schema.properties.provider).to.deep.equal(
          providerPieceOfSchema
        );

        const expectedHandlerPieceOfSchema = { type: 'string' };
        expect(
          serverless.serverless.configSchemaHandler.schema.properties.functions.patternProperties[
            FUNCTION_NAME_PATTERN
          ].properties.handler
        ).to.deep.equal(expectedHandlerPieceOfSchema);
        return;
      });
    });
  });
});
