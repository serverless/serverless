'use strict';

const expect = require('chai').expect;
const ConfigSchemaHandler = require('./ConfigSchemaHandler');
const Serverless = require('../Serverless');
const runServerless = require('../../tests/utils/run-serverless');
const fixtures = require('../../tests/fixtures');

describe('ConfigSchemaHandler', () => {
  describe('#constructor', () => {
    it('should have schema property', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      expect(configSchemaHandler.schema).to.be.instanceOf(Object);
    });

    it('should have serverless property', () => {
      const serverless = new Serverless();
      const configSchemaHandler = new ConfigSchemaHandler(serverless);
      expect(configSchemaHandler.serverless).to.be.instanceOf(Serverless);
    });

    it('should freeze parts of schema', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      const throwables = [
        () => {
          configSchemaHandler.defineProvider('someProvider');
          configSchemaHandler.schema.properties.newProp = { foo: 'bar' };
        },
        () => {
          configSchemaHandler.schema.properties.service.name = 'changed';
        },
        () => {
          configSchemaHandler.schema.properties.plugins.properties = 'changed';
        },
        () => {
          configSchemaHandler.schema.properties.plugins.properties.items = {
            type: 'object',
            properties: { newProp: { type: 'string' } },
          };
        },
        () => {
          configSchemaHandler.schema.properties.resources.anyOf[1].properties = {
            oneMore: { type: 'string' },
          };
        },
        () => {
          configSchemaHandler.schema.properties.package.properties.oneMore = { type: 'string' };
        },
        () => {
          configSchemaHandler.schema.properties.layers.properties = 'changed';
        },
      ];
      for (const throwable of throwables) {
        expect(throwable).to.throw(Error);
      }
    });
  });

  describe('#validateConfig', () => {
    it('should run without errors for valid config', () => {
      return runServerless({
        cwd: fixtures.map.configSchemaExtensions,
        cliArgs: ['info', '--configValidationMode', 'error'],
      }).then(() => expect(true).to.be.true);
    });
  });

  describe('#defineFunctionEvent', () => {
    it('should extend schema with defineFunctionEvent method', () => {
      return runServerless({
        cwd: fixtures.map.configSchemaExtensions,
        cliArgs: ['info', '--configValidationMode', 'error'],
      }).then(serverless => {
        const expectedPieceOfSchema = {
          type: 'object',
          properties: {
            someEvent: {
              type: 'object',
              properties: {
                someStringProp: { type: 'string' },
                someNumberProp: { type: 'number' },
              },
            },
          },
          required: ['someEvent'],
          additionalProperties: false,
        };

        const arrLength =
          serverless.configSchemaHandler.schema.properties.functions.patternProperties[
            '^[a-zA-Z0-9-_]+$'
          ].properties.events.items.anyOf.length;
        expect(
          serverless.configSchemaHandler.schema.properties.functions.patternProperties[
            '^[a-zA-Z0-9-_]+$'
          ].properties.events.items.anyOf[arrLength - 1]
        ).to.deep.equal(expectedPieceOfSchema);
        return;
      });
    });
  });

  describe('#defineCustomProperty', () => {
    it('should extend schema with defineCustomProperty method', () => {
      return runServerless({
        cwd: fixtures.map.configSchemaExtensions,
        cliArgs: ['info', '--configValidationMode', 'error'],
      }).then(serverless => {
        const someCustomStringProp = {
          type: 'string',
        };
        expect(
          serverless.configSchemaHandler.schema.properties.custom.properties.someCustomStringProp
        ).to.deep.equal(someCustomStringProp);
        return;
      });
    });
  });

  describe('#defineProvider', () => {
    it('should extend schema with defineProvider method', () => {
      return runServerless({
        cwd: fixtures.map.configSchemaExtensions,
        cliArgs: ['info', '--configValidationMode', 'error'],
      }).then(serverless => {
        const providerPieceOfSchema = {
          type: 'object',
          properties: {
            name: { enum: ['someProvider'] },
          },
          required: ['name'],
          additionalProperties: true,
        };
        expect(serverless.configSchemaHandler.schema.properties.provider).to.deep.equal(
          providerPieceOfSchema
        );

        const expectedHandlerPieceOfSchema = { type: 'string' };
        expect(
          serverless.configSchemaHandler.schema.properties.functions.patternProperties[
            '^[a-zA-Z0-9-_]+$'
          ].properties.handler
        ).to.deep.equal(expectedHandlerPieceOfSchema);
        expect(
          serverless.configSchemaHandler.schema.properties.functions.patternProperties[
            '^[a-zA-Z0-9-_]+$'
          ].additionalProperties
        ).to.be.true;
        return;
      });
    });
  });
});
