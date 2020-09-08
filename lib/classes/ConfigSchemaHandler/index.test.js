'use strict';

const expect = require('chai').expect;
const runServerless = require('../../../test/utils/run-serverless');

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
            '^[a-zA-Z0-9-_]+$'
          ].properties.events.items.anyOf[1]
        ).to.deep.equal(expectedPieceOfSchema);
        return;
      });
    });
  });

  describe('#defineCustomProperty', () => {
    it('should extend schema with defineCustomProperty method', () => {
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
            '^[a-zA-Z0-9-_]+$'
          ].properties.handler
        ).to.deep.equal(expectedHandlerPieceOfSchema);
        return;
      });
    });
  });
});
