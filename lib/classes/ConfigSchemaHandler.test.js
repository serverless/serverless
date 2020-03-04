'use strict';

const expect = require('chai').expect;
const ConfigSchemaHandler = require('./ConfigSchemaHandler');

describe('ConfigSchemaHandler', () => {
  describe('#constructor', () => {
    it('should have schema property', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      expect(configSchemaHandler.schema).to.be.instanceOf(Object);
    });

    it('should freeze parts of schema', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      const throwables = [
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
        () => {
          configSchemaHandler.schema.properties.outputs.properties = 'changed';
        },
      ];
      for (const throwable of throwables) {
        expect(throwable).to.throw(Error);
      }
    });
  });

  describe('#defineFunctionEvent', () => {
    it('should extend schema with defineFunctionEvent method', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      const newEventSchema = {
        type: 'string',
      };
      configSchemaHandler.defineFunctionEvent('newEvent', newEventSchema);
      const expectedPieceOfSchema = {
        type: 'object',
        properties: { newEvent: { type: 'string' } },
        required: ['newEvent'],
        additionalProperties: false,
      };
      expect(
        configSchemaHandler.schema.properties.functions.patternProperties['^[a-zA-Z0-9-_]+$']
          .properties.events.items.anyOf[0]
      ).to.deep.equal(expectedPieceOfSchema);
    });
  });

  describe('#defineCustomProperty', () => {
    it('should extend schema with defineCustomProperty method', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      const newCustomPropSchema = {
        type: 'string',
      };
      configSchemaHandler.defineCustomProperty('newCustomProp', newCustomPropSchema);
      expect(configSchemaHandler.schema.properties.custom.properties.newCustomProp).to.deep.equal(
        newCustomPropSchema
      );
    });
  });
});
